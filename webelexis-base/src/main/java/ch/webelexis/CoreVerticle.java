/**
 * This file is part of Webelexis
 * Copyright (c) 2015 by G. Weirich
 */
package ch.webelexis;

import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.util.ArrayList;

import org.vertx.java.busmods.BusModBase;
import org.vertx.java.core.AsyncResult;
import org.vertx.java.core.AsyncResultHandler;
import org.vertx.java.core.Future;
import org.vertx.java.core.Handler;
import org.vertx.java.core.http.HttpServer;
import org.vertx.java.core.http.HttpServerRequest;
import org.vertx.java.core.json.JsonObject;
import org.vertx.java.core.logging.Logger;
import org.vertx.java.core.sockjs.SockJSServer;

/**
 * The Webelexis core verticle deploys all needed modules and verticles and sets
 * up the http- and sockjs-Servers. Configuration for all objects is taken from
 * a file called "config_defaults.json", that must be situated at the root
 * directory of the module. A second file, cfglocal.json in the same directory
 * should contain modifications for the actual setup. Options in cfglocal.json
 * will override those in config_defaults.json. It is <em>NOT</em> recommended
 * to modify config_defaults.json directly, since Webelexis updates will
 * overwrite this file (but not cfglocal.json).
 * 
 * @author gerry
 *
 */
public class CoreVerticle extends BusModBase {
	JsonObject cfg_default;
	JsonObject cfg;
	Logger log;
	ArrayList<String> pending = new ArrayList<String>();
	Throwable reason = null;

	/**
	 * Enter all modules and verticles to deploy here. Note: Webelexis will
	 * deploy them asynchronously, so there is no guaranteed order for them to
	 * be ready. Modules don't need to exist locally. The system will fetch them
	 * from the vert.x module repository as needed.
	 */
	V[] modules = new V[] {
			new V("sql", "io.vertx~mod-mysql-postgresql_2.10~0.3.1"),
			new V("mongo", "io.vertx~mod-mongo-persistor~2.1.0") };
	V[] verticles = new V[] { new V("auth", "ch.rgw.vertx.AuthManager"),
			new V("agenda", "ch.webelexis.agenda.Server") };

	public CoreVerticle() throws IOException {
		File file = new File("config_defaults.json"); // production mode
		if (!file.exists()) {
			file = new File("src/main/resources/config_sample.json"); // IDE
																		// mode
		}
		char[] buffer = new char[(int) file.length()];
		FileReader fr = new FileReader(file);
		/* int num= */fr.read(buffer);
		fr.close();
		String conf = new String(buffer).replaceAll("//.+\\n", "");
		cfg_default = new JsonObject(conf);
	}

	@Override
	public void start(final Future<Void> startedResult) {
		log = container.logger();
		cfg = cfg_default.mergeIn(container.config());

		for (V m : modules) {
			pending.add(m.title);
			container.deployModule(m.fullname, cfg.getObject(m.title),
					new DeploymentHandler(m.title));
		}
		for (V v : verticles) {
			pending.add(v.title);
			container.deployWorkerVerticle(v.fullname, cfg.getObject(v.title),
					1, true, new DeploymentHandler(v.title));
		}
		long waitingTime = System.currentTimeMillis();
		vertx.setPeriodic(200, new Handler<Long>() {

			@Override
			public void handle(Long timerID) {
				if (pending.isEmpty()) {
					vertx.cancelTimer(timerID);
					startedResult.setResult(null);
				} else {
					if ((System.currentTimeMillis() - waitingTime) > 10000) {
						vertx.cancelTimer(timerID);
						startedResult.setFailure(new Exception(
								"Timeout waiting for launching modules"));
					}
				}
				if (reason != null) {
					vertx.cancelTimer(timerID);
					startedResult.setFailure(reason);
				}
			}
		});
		JsonObject bridgeCfg = cfg.getObject("bridge");
		HttpServer http = vertx.createHttpServer();
		http.requestHandler(new Handler<HttpServerRequest>() {
			public void handle(HttpServerRequest req) {
				String file = "";
				if (req.path().equals("/")) {
					file = "index.html";
				} else if (req.path().contains("..")) {
					req.response().setStatusCode(404);
					req.response().end();
				} else {
					file = req.path();
				}
				File ans = new File(bridgeCfg.getString("webroot"), file);
				// System.out.println(ans.getAbsolutePath());
				req.response().sendFile(ans.getAbsolutePath());
			}
		});
		SockJSServer sock = vertx.createSockJSServer(http);
		sock.bridge(new JsonObject().putString("prefix", "/eventbus"),
				bridgeCfg.getArray("inOK"), bridgeCfg.getArray("outOK"));
		sock.setHook(new EventBusHook());
		http.listen(bridgeCfg.getInteger("port"));
		startedResult.setResult(null);
	}

	private class DeploymentHandler implements AsyncResultHandler<String> {
		String t;

		DeploymentHandler(String title) {
			t = title;
		}

		@Override
		public void handle(AsyncResult<String> result) {
			pending.remove(t);
			if (result.succeeded()) {
				log.info("Deployed successfully: " + t);
			} else {
				reason = result.cause();
				log.fatal("failed to deploy " + t + ": " + result.result(),
						result.cause());

			}
		}

	}

	private class V {
		V(String t, String f) {
			title = t;
			fullname = f;
		}

		String title;
		String fullname;
	}
}

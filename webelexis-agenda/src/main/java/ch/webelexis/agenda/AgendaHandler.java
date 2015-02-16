/**
 * (c) 2015 by G. Weirich
 */
package ch.webelexis.agenda;

import org.vertx.java.core.Handler;
import org.vertx.java.core.eventbus.EventBus;
import org.vertx.java.core.eventbus.Message;
import org.vertx.java.core.json.JsonArray;
import org.vertx.java.core.json.JsonObject;

/**
 * A handler for requests to the agenda. Since we won't allow random access to
 * the database, we translate external requests to internal messages here.
 * 
 * @author gerry
 * 
 */
public class AgendaHandler implements Handler<Message<JsonObject>> {
	EventBus eb;
	static final String ELEXISDATE = "20[0-9]{6,6}";
	static final String NAME = "[0-9a-zA-Z ]+";

	AgendaHandler(EventBus eb) {
		this.eb = eb;
	}

	/*
	 * this is, what mod_mysql expects { "action" : "prepared", "statement" :
	 * "SELECT * FROM some_test WHERE name=? AND money > ?", "values" :
	 * ["Mr. Test", 15] }
	 * 
	 * and this is, what we expect from the client: { "begin": "yyyymmdd",
	 * "end": "yyyymmdd", "resource": resource, "token": auth-token }
	 */
	@Override
	public void handle(final Message<JsonObject> externalRequest) {
		final JsonObject request = externalRequest.body();
		String token = request.getString("token");
		if (token == null) {
			handlePublic(externalRequest, request);
		} else {
			eb.send("ch.webelexis.auth.authorise",
					new JsonObject().putString("sessionID", token),
					new Handler<Message<JsonObject>>() {

						@Override
						public void handle(Message<JsonObject> localAnswer) {
							if (localAnswer.body().getString("status")
									.equalsIgnoreCase("ok")) {
								handleAuthorized(externalRequest, request);

							} else {
								handlePublic(externalRequest, request);
							}

						}
					});

			Server.log.info("received request");
		}
	}

	/**
	 * This is what a unauthorized client gets
	 * 
	 * @param event
	 * @param request
	 */
	private void handlePublic(final Message<JsonObject> event,
			JsonObject request) {
		final String cleanedDate = getCleaned(request, "begin", ELEXISDATE);
		JsonObject bridge = new JsonObject()
				.putString("action", "prepared")
				.putString(
						"statement",
						"SELECT Tag,Beginn,Dauer from AGNTERMINE where Tag>=? and Tag <=? and Bereich=? and deleted='0'")
				.putArray(
						"values",
						new JsonArray(new String[] { cleanedDate, cleanedDate,
								getCleaned(request, "resource", NAME) }));
		eb.send("ch.webelexis.sql", bridge, new Handler<Message<JsonObject>>() {

			@Override
			public void handle(Message<JsonObject> returnvalue) {
				JsonObject res = returnvalue.body();
				if (res.getString("status").equals("ok")) {
					JsonArray results = res.getArray("results");
					JsonObject appnt = new JsonObject()
							.putString("type", "basic")
							.putString("name", "")
							.putString("day", cleanedDate)
							.putNumber("begin",
									Integer.parseInt((String) results.get(0)))
							.putNumber("duration",
									Integer.parseInt((String) results.get(1)))
							.putString("resource", (String) results.get(2));
					event.reply(appnt);

				}else{
					event.reply(new JsonObject().putString("type", "failure"));
				}
			}
		});
	}

	/**
	 * This is, what an authorized user gets
	 * 
	 * @param event
	 * @param request
	 */
	private void handleAuthorized(final Message<JsonObject> event,
			JsonObject request) {
		JsonObject bridge = new JsonObject()
				.putString("action", "prepared")
				.putString(
						"statement",
						"SELECT A.Tag,A.Beginn,A.Dauer, A.PatID, K.Bezeichnung1,K.Bezeichnung2,A.TerminTyp,A.TerminStatus,A.Grund from AGNTERMINE as A, KONTAKT as K where K.id=A.PatID and Tag>=? and Tag <=? and Bereich=? and A.deleted='0'")
				.putArray(
						"values",
						new JsonArray(new String[] {
								getCleaned(request, "begin", ELEXISDATE),
								getCleaned(request, "end", ELEXISDATE),
								getCleaned(request, "resource", NAME) }));
		eb.send("ch.webelexis.sql", bridge, new Handler<Message<JsonObject>>() {

			@Override
			public void handle(Message<JsonObject> returnvalue) {
				JsonObject res = returnvalue.body();
				event.reply(res);
			}
		});

	}

	private String getCleaned(JsonObject jo, String field, String pattern) {
		String raw = jo.getString(field);
		if ((raw != null) && raw.matches(pattern)) {
			return raw;
		} else {
			return "";
		}
	}
}

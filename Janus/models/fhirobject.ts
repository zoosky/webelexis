/***************************************
 * This file is part of Webelexis(tm)
 * Copyright (c) 2017 by G. Weirich.
 * All rights reserved.
 ***************************************/
import * as moment from "moment";
import {FHIR_Identifier, FHIR_Meta, FHIR_Period, FHIR_Resource} from "../common/models/fhir";
import {SQL} from "../services/mysql";
import {NoSQL} from "../services/mongo";
import * as XID from "../common/xid";
let log = require('winston')
let config = require('nconf')

export class FhirObject {
  protected logger = log
  protected cfg = config
  protected xid = XID.domains

  constructor(protected sql: SQL, protected nosql: NoSQL) {
    let loglevel = this.cfg.get("loglevel")
    if (!loglevel) {
      loglevel = "debug"
    }
    this.logger.level = loglevel
  }

  /**
   * failsafe Array join. Returns the empty string if arr is undefined
   * @param arr
   * @param sep
   * @returns {any}
   */
  join(arr: Array<any>, sep: string = " ") {
    if (arr) {
      return arr.join(sep)
    } else {
      return ""
    }
  }

  /**
   * failsafe property get.
   * @param obj Obvject to read from
   * @param name property to read.
   * @returns {string} the property or an empty string if no such property exists in obj
   */
  prop(obj, name) {
    if (obj) {
      return obj[name] ? obj[name] : ""
    } else {
      return ""
    }
  }

  /**
   * Make a FHIR Period
   * @param begin
   * @param end
   * @returns {{start: string, end: string}}
   */
  makePeriod(begin: string, end: string): FHIR_Period {

    return {
      start: moment(begin, "YYYYMMDD").format(),
      end: moment(end, "YYYYMMDD").format()
    }
  }

  makeIdentifier(id: string): FHIR_Identifier {
    return {
      use: "usual",
      system: this.xid.elexis_uuid,
      value: id,
      assigner: this.cfg.get("client")["general"].officeName
    }
  }

  /**
   * get a timestamp a FHIR compliant Meta-Element
   * @param fh
   * @returns {Date} the timestamp as Date or now()
   */
  readTimestamp(fh: FHIR_Resource) {
    let meta = this.prop(fh, "meta")
    let lastupdate = new Date()
    if (meta && meta.lastUpdated) {
      lastupdate = moment(meta.lastUpdated).toDate()
    }
    return lastupdate
  }

  createTimestampMeta(fh: FHIR_Resource): FHIR_Meta {
    let meta = fh['meta']
    if (!meta) {
      meta = {}
    }
    meta['lastUpdated'] = moment().format()
    return meta
  }


  async _deleteObject(table: string, datatype:string, id:string) {
    let sql = `UPDATE ${table} set deleted='1' where ID=?`
    let sqlPromise = this.sql.queryAsync(sql, [id])
    let nosqlPromise = this.nosql.deleteAsync(datatype,id)
    return Promise.all([sqlPromise, nosqlPromise])
  }

  /**
   * create an "INSERT or UPDATE" statement
   * @param table
   * @param fields
   * @returns {string}
   */
  public static makeSQLString(table: string, fields: Array<string>): string {
    let qms = "?,".repeat(fields.length)
    let sql = `INSERT INTO ${table} (${fields.join(",")}) VALUES (${qms.substring(0, qms.length - 1)}) ` +
      "ON DUPLICATE KEY UPDATE "
    for (var i = 0; i < fields.length; i++) {
      sql += `${fields[i]}=VALUES(${fields[i]}),`
    }
    return sql.substring(0, sql.length - 1)
  }

  private static dive(obj, prop) {
    var i = prop.indexOf('[')
    if (i != -1) {
      var index = prop.substring(i + 1, prop.length - 1)
      prop = prop.substring(0, i)
      if (obj[prop] instanceof Array) {
        return obj[prop][index]
      } else {
        return undefined
      }
    } else {
      return obj[prop]
    }
  }

  /**
   * failsafe retrieve an attribute from a FHIR_Resource. Returns the empty string if an element in the property chain
   * is undefined
   * @param fhir
   * @param property Can be an expression like 'foo.bar[2].baz'
   * @returns {string} the attribute or "" if no such attribute exists
   */
  public static getAttribute(fhir, property: string) {
    var spl = property.split(/\./)
    var ret = ""
    var obj = fhir
    spl.forEach(subprop => {
      if (obj) {
        var prop = FhirObject.dive(obj, subprop)
        if (typeof(prop) == 'undefined' || prop == null) {
          obj = null
          ret = ""
        } else {
          ret = prop
          obj = prop
        }
      }
    })
    return ret

  }

  public createUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    })
  }

  pushNoSql(fhir: FHIR_Resource): Promise<void> {
    return new Promise<void>(resolve => {
      resolve()
    });
  }

  protected addMongoTerms(fields, val) {
    var arr = []
    var valm = new RegExp("^" + val, "i")
    fields.forEach(function (field) {
      var elem = {}
      elem[field] = valm
      arr.push(elem)
    })
    return {$or: arr}
  }

}



/**
 ** This file is part of Webelexis
 ** (c) 2015 by G. Weirich
 */
define(['knockout', 'app/datetools', 'app/eb', 'app/config', 'text!tmpl/ch-webelexis-detailagenda.html', 'knockout-jqueryui/datepicker', 'domReady!'], function (ko, dt, bus, cfg, html) {


    /**
     * client side representation of an Elexis-appointment
     * 0 tag,1 beginn,2 dauer, 3 bereich, 4 termintyp,5 terminID,6 PatientID,7 Terminstatus,8 Grund,9 Kontakt-bez, 10 Kontakt-bez2
     */

    function AgendaViewModel() {
        var self = this;
        self.tage = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]
        self.monate = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]
        self.monateKurz = ["Jan", "Feb", "März", "April", "Mai", "Jun", "Jul", "Aug", "Sept", "Okt", "Nov", "Dez"]
        self.title = "Agenda"

        self.Appointment = function (row) {
            var app = this;
            app.expanded = ko.observable(false)
            app.date = dt.makeDate(row[0])
            app.begin = dt.makeTime(parseInt(row[1]));
            app.end = dt.makeTime(parseInt(row[1]) + parseInt(row[2]));
            app.time = app.begin + "-" + app.end
            app.type = row[4]
            app.terminID = row[5]
            app.patientID = row[6]
            app.state = row[7]
            app.reason = row[8]
            app.firstName = row[9]
            app.lastName = row[10]

            app.displayName = app.lastName ? (app.lastName + " " + app.firstName) : app.PatientID
            app.displayClass = ko.pureComputed(function () {
                return app.type === 'available' ? "available" : "occupied"
            })
            app.displayText = ko.pureComputed(function () {
                return app.begin + "-" + app.end + " " + app.displayName
            })


        }
        self.now = ko.observable(dt.makeDateString(new Date()))

        self.appointments = ko.observableArray([]);
        self.lastExpanded = null
        self.resources = ko.observableArray([])
        self.resource = ko.observable()
        self.loadResources = function () {
            self.resources.removeAllItems()
            bus.send("ch.webelexis.agenda", {
                token: cfg.sessionID(),
                request: 'getResources'
            }, function (result) {
                if (result.status === "ok") {
                    result.data.forEach(function (item) {
                        self.resources.push(item)
                    })
                    self.resource(self.resources()[0])
                }
            })
        }

        self.readDate = function () {
            var date = dt.makeDateFromlocal(self.now())
            return date
        }
        self.writeDate = function (date) {
            self.now(dt.makeDateString(date))
        }
        self.today = function () {
            self.writeDate(new Date())
            self.loadAppointments()
        }
        self.yesterday = function () {
            self.writeDate(new Date(self.readDate().getTime() - (24 * 60 * 60000)))
            self.loadAppointments()
        }
        self.tomorrow = function () {
            self.writeDate(new Date(self.readDate().getTime() + (24 * 60 * 60000)))
            self.loadAppointments()

        }


        self.dateChanged = function (datestring /*,widget*/ ) {
            self.now(datestring)
            self.loadAppointments()
        }
        self.loadAppointments = function () {
            var act = self.readDate()
            if (self.lastExpanded !== null) {
                self.lastExpanded.expanded(false);
                self.lastExpanded = null;
            }
            bus.send('ch.webelexis.agenda', {
                request: 'list',
                resource: self.resource,
                begin: dt.makeCompactString(act),
                end: dt.makeCompactString(act),
                token: cfg.sessionID()
            }, function (result) {
                //console.log("result: " + JSON.stringify(result));
                if ((result.status === undefined) || result.status !== "ok") {
                    window.alert("Verbindungsfehler: " + result.status === undefined ? "keine Verbindung" : result.status);
                } else {
                    self.appointments.removeAll()
                    var appnts = result.appointments;
                    if (appnts !== undefined) {
                        appnts.forEach(function (value) {
                            var act = new self.Appointment(value)
                            self.appointments.push(act);
                        })
                    }

                }
            })
        }
        self.expand = function (idx) {
            if (idx.type === 'available') {
                if (self.lastExpanded !== null) {
                    self.lastExpanded.expanded(false)
                }
                idx.expanded(true);
                self.lastExpanded = idx;
                console.log("opened: " + idx.begin)
            }
        }

        self.collapse = function (idx) {
            idx.expanded(false)
            self.lastExpanded = null;
        }

        self.clear = function () {
            self.appointments.removeAll()
        }

        self.addAppointment = function ( /*formElement*/ ) {
            console.log("addApp" + $("input#patname").val())
            console.log(this.begin)
            bus.send('ch.webelexis.agenda', {
                request: 'insert',
                day: dt.makeCompactString(this.date),
                time: this.begin,
                //ip: cfg.loc.ip,
                name: $("input#patname").val() + "," + $("input#patphone").val() + "," + $("input#patmail").val()
            }, function (result) {
                // console.log("insert: " + JSON.stringify(result))
                if (result.status !== "ok") {
                    window.alert("Fehler beim Eintragen: " + result.status)
                } else {
                    self.load();
                }
            });
        }
        var busListener = function (msg) {
            if (msg === "open") {
                self.loadAppointments()
            }
        }
        bus.addListener(busListener)

        if (bus.connected()) {
            self.loadAppointments();
        }

    }


    AgendaViewModel.prototype.dispose = function () {
        bus.removeListener(AgendaViewModel.busListener)
    }
    return {
        viewModel: AgendaViewModel,
        template: html
    }
});
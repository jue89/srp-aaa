var os = require( 'os' );
var mqtt = require( 'mqtt' );

function Log() {}
Log.prototype = {
	init: function( host, port, fqdn ) {
		var self = this;

		self.mqtt = mqtt.createClient( port, host );
		self.fqdn = fqdn;
		self.connected = false;
		self.mqtt.on( 'connect', function() {
			self.toConsole( 0, "Connected to MQTT message broker" );
			self.connected = true;
			setInterval( function() {
				self.mqtt.publish( 'heartbeat', JSON.stringify( {
					host: fqdn,
					load: os.loadavg()
				} ) );
			}, 5000 );
		} );
	},
	log: function( level, message ) {
		var self = this;

		self.toConsole( level, message );

		if( self.connected ) self.mqtt.publish( 'log', JSON.stringify( {
			host: self.fqdn,
			type: level,
			msg: message
		} ) );
	},
	toConsole: function( level, message ) {
		var d = new Date();

		switch( level ) {
			case 0: level = 'DEBUG 0'; break;
			case 1: level = 'DEBUG 1'; break;
			case 2: level = 'WARN   '; break;
		}

		console.log( '%s -- %s -- %s', d.toUTCString(), level, message );
	},
	debug0: function( message ) { this.log( 0, message ); },
	debug1: function( message ) { this.log( 1, message ); },
	warn: function( message ) { this.log( 2, message ); },
}

module.exports = new Log();

var async = require( 'async' );

var config = require( './lib/config.js' );
var log = require( './lib/log.js' );
var bridge = require( './bridge.js' );
var fastd = require( './fastd.js' );
var radiusd = require( './radiusd.js' );

config( function( config ) {
	// Log init
	log.init( config.mqtt.host, config.mqtt.port, config.fqdn );

	// Start API bridge
	bridge.start( config );

	// Start FASTD
	fastd.start( config );

	// Start RADIUSD
	radiusd.start( config );
} );

function shutdown() {
	async.parallel( [
		// Stop FASTD
		function( done ) { fastd.stop( done ); },
		// Stop RADIUSD
		function( done ) { radiusd.stop( done ); }
	], function() {
		console.log("SEE YA!");
		process.exit(0);
	} );
}
process.once( 'SIGINT', shutdown ).once( 'SIGTERM', shutdown );

var exec = require( 'child_process' ).exec;
var spawn = require( 'child_process' ).spawn;
var path = require( 'path' );
var fs = require( 'fs' );
var async = require( 'async' );
var mqtt = require( 'mqtt' );
var ctrl = require( './lib/ctrl.js' );

var fastd;
var fastdExit = false;

var cacheDir = path.resolve( __dirname, 'cache' );
var confFile = cacheDir + '/fastd.conf';
var peerPath = cacheDir + '/fastd-peers';
var errFile = fs.createWriteStream( cacheDir + '/fastd.log', { flags: 'a' } );


function Fastd() {}

Fastd.prototype = {
	// Starts FASTD
	start: function( config ) {
		var self = this;

		// Clear all existing peers
		fs.readdirSync( peerPath ).forEach( function( f ) {
			fs.unlinkSync( peerPath + '/' + f );
		} );
		console.log( "FASTD: Cleaned peer directory." );

		// Write config file
		fs.writeFileSync(
			confFile,
			 'secret "' + config.privateKey + '";\n'
			+'interface "aaa";\n'
			+'mtu 1426;\n'
			+'bind 0.0.0.0:1337;\n'
			+'method "xsalsa20-poly1305";\n'
			+'on up "ip link set dev $INTERFACE up; ip addr add ' + config.ipv6_addr + '/64 dev $INTERFACE";\n'
			+'on down "ip link set dev $INTERFACE down";\n'
			+'include peers from "fastd-peers";\n'
			+'log to stderr level debug2;\n'
		);

		// Spawn FASTD
		fastd = spawn( 'fastd', [
			'--config', confFile
		] );
		fastd.stderr.pipe( errFile );
		fastd.on( 'exit', function() {
			if( ! fastdExit ) console.log( "FASTD: Errors occured. Confirm the log file cache/fastd.log" );
			console.log( "FASTD: Stopped." );
			errFile.end();
		} );
		console.log( "FASTD: Spwaned fastd." );

		// Give FASTD some time to start
		setTimeout( function() {
			// Start listener to MQTT
			// TODO: Add auth
			var mqttc = mqtt.createClient( config.mqtt.port, config.mqtt.host );
			mqttc.subscribe( 'ap/+' );
			mqttc.on( 'message', function( topic, message ) {
				topic = topic.split('/');
				if( topic[0] != "ap" ) return;
				message = JSON.parse( message );
				switch( topic[1] ) {
					case 'add': self.addPeers( message ); break;
					case 'remove': self.removePeers( message ); break;
					case 'update': self.modifyPeers( message ); break;
				}
			} );

			// Get all peers
			ctrl.get( 'aps?fields=public_key&limit=0', function( err, res ) {
				if( err ) throw err;

				// Add all Aps
				if( res.body.aps.length > 0 ) self.addPeers( res.body.aps );
			} );
		}, 500 );
	},

	// Stops FASTD
	stop: function( done ) {
		fastdExit = true;

		// Setup exit event
		fastd.on( 'exit', function() {
			done();
		} );
		
		// Send SIGTERM to fastd
		fastd.kill();
	},

	// Adds peer
	addPeers: function( peers, done ) {
		if( ! peers.length ) peers = [ peers ];
		if( typeof done != "function" ) done = function() {};

		// Iterate through all peers
		async.each( peers, function( peer, done ) {
			// Write config file for each one
			fs.writeFile(
				peerPath + '/' + peer.id,
				'key "' + peer.public_key + '";\n',
				function( err ) {
					if( err ) console.error( err );
					console.log( "FASTD: Added peer " + peer.id );
					done();
				}
			)
		}, function() {
			// When done inform FASTD about newly added peers
			if( fastd ) fastd.kill( 'SIGHUP' );
			console.log( "FASTD: Reloaded peer directory." );
		} );
	},

	// Removes peer
	removePeers: function( peers, done ) {
		if( ! peers.length ) peers = [ peers ];
		if( typeof done != "function" ) done = function() {};

		// Iterate through all peers
		async.each( peers, function( peer, done ) {
			// Write config file for each one
			fs.unlink(
				peerPath + '/' + peer.id,
				function( err ) {
					if( err ) console.error( err );
					console.log( "FASTD: Removed peer " + peer.id );
					done();
				}
			)
		}, function() {
			// When done inform FASTD about newly added peers
			if( fastd ) fastd.kill( 'SIGHUP' );
			console.log( "FASTD: Reloaded peer directory." );
			done();
		} );

	},

	// Modifies peer
	modifyPeers: function( peers, done ) {
		if( typeof done != "function" ) done = function() {};

		var self = this;
		
		// Modifying peers is just removing and adding peers ...
		self.removePeers( peers, function( ) {
			self.addPeers( peers, done );
		} );
	},

	// Generates key pair
	genKey: function( done ) {
		return exec( 'fastd --generate-key', function( err, stdout, stderr ) {
			if( err ) return done( err );

			// Get keys
			var regex = /^Secret: ([^n]*)\nPublic: ([^\n]*)\n$/im;
			var keys = regex.exec( stdout );

			// When groups are not available --> Something went wrong
			if( ! keys || ! keys[1] || ! keys[2] ) return done( new Error( "Something went wrong reading generated keys." ) );

			console.log( "FASTD: Generated key pair." );

			done( null, {
				privateKey: keys[1],
				publicKey: keys[2]
			} );
		} );
	}
}

module.exports = new Fastd();

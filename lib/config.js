var async = require( 'async' );
var fs = require( 'fs' );
var path = require( 'path' );
var ctrl = require( './ctrl.js' );
var fastd = require( '../fastd.js' );


var files = {
	ctrl: '../config/ctrl.json',
	local: '../config/local.json'
};

module.exports = function( done ) {
	// Read config from file
	var ctrlConf = require( files.ctrl );

	// Read CA file
	ctrlConf.ca = fs.readFileSync( path.resolve( __dirname, '../config/' + ctrlConf.ca ) );

	// Configure CTRL connection
	ctrl.init( ctrlConf );

	// Read local configuration
	var localConf = {};
	if( fs.existsSync( path.resolve( __dirname, files.local ) ) ) localConf = require( files.local );
	if( ! localConf.fqdn ) throw new Error( "Please create a local configuration file stating the host's FQDN\nExample: { \"fqdn\": \"aaa.example.com\" }" );

	// Do some checks and so on
	async.waterfall( [
		function( done ) {
			// Has already been generated --> Skip
			if( localConf.privateKey && localConf.publicKey ) return done();

			// Generate key
			fastd.genKey( function( err, keys ) {
				if( err ) throw err;
				localConf.privateKey = keys.privateKey;
				localConf.publicKey = keys.publicKey;
				done();
			} );
		},
		function( done ) {
			// Already registered? --> Check if account is still valid
			if( localConf.id ) {
				// Check if account still exists
				ctrl.get( 'aaas/' + localConf.id, function( err, res ) {
					if( err ) {
						if( err.message == 401 ) {
							// Wrong credentials ?
							throw new Error( "Unauthorised. Check your credentials!" );
						} else {
							// Otherwise --> delete existing
							localConf.id = null;
							return done();
						}
					}

					if( res.body && res.body.aaas && res.body.aaas.id == localConf.id ) {
						// Still valid --> okey dokey!
						return done();
					} else {
						// Otherwise --> delete existing
						localConf.id = null;
						return done();
					}
				} );
			} else {
				done();
			}
		},
		function( done ) {
			if( ! localConf.id ) {
				// Not registered? --> Create a new account
				ctrl.post( 'aaas', { aaas: {
					user_id: ctrlConf.user,
					public_key: localConf.publicKey,
					fqdn: localConf.fqdn
				} }, function( err, res ) {
					if( err ) throw err;

					localConf.id = res.body.aaas.id;
					done();
				} );
			} else {
				// Registered? --> Update FQDN
				ctrl.put ( 'aaas/' + localConf.id, { aaas: {
					id: localConf.id,
					fqdn: localConf.fqdn
				} }, function( err, res ) {
					if( err ) throw err;
					done();
				} );
			}
		},
		function( done ) {
			// Get configuration
			ctrl.get( 'aaas/' + localConf.id + '/config', function( err, res ) {
				localConf.ipv6_addr = res.body.config.ipv6_addr;
				localConf.ipv6_net = res.body.config.ipv6_net;
				localConf.mqtt = res.body.config.mqtt;
				done();
			} );
		}
	], function() {
		// Everything is done --> save localConf
		fs.writeFileSync( path.resolve( __dirname, files.local ), JSON.stringify( localConf, null, '  ' ) );

		// We're done here ...
		done( localConf );
	} );
	
}

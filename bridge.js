var net = require( 'net' );
var async = require( 'async' );
var Cache = require( 'node-cache' );
var ctrl = require( './lib/ctrl.js' );
var helper = require( './lib/helper.js' );

var srv;
var userCache;
var sessionCache;

function Bridge() {}

Bridge.prototype = {
	start: function( config ) {
		var self = this;

		srv = net.createServer();
		srv.on( 'connection', function( c ) {
			var req = "";
			c.on( 'data', function( chunk ) {
				// Add chunk of data to request
				req += chunk.toString();

				// End of packet
				if( req.substr( -2, 2 ) == '\n\n' ) {
					// Read lines
					var lines = req.split( '\n' );
					// First line is function
					var func = lines.shift();
					var args = {};
					lines.forEach( function( l ) {
						// Skip empty lines
						if( l == "" ) return;
						
						var fields = l.split( '=' );
						args[ fields[0].trim() ] = fields[1].trim();
					} );
					switch( func ) {
						case 'USER': self._user( args, c ); break;
						case 'ACCT': self._acct( args, c ); break;
						case 'AUTH': self._auth( args, c ); break;
						case 'NAS_SECRET': self._nas( 'aaa_secret', args, c ); break;
						case 'NAS_NAME': self._nas( 'id', args, c ); break;
						default: c.end( "2\n" );
					}
				}
			} );
		} );
		srv.on( 'listening', function() {
			console.log( "BRIDGE: Listening to Port 2337" );
		} );
		srv.listen( 2337, '127.0.0.1' );

		userCache = new Cache( { stdTTL: 90, checkPeriod: 0 } );
		sessionCache = new Cache( { stdTTL: 43200, checkPeriod: 0 } );
	},
	
	_user: function( args, c ) {
		console.log( "BRIDGE: Query user " + args.id );
		
		// TODO: Caching

		ctrl.get( 'users/' + args.id + '?filter[enabled]=true&filter[confirmed]=true&filter[guest]=true&fields=password', function( err, res ) {
			if( err ) {
				if( err.message == 404 ) return c.end( '7\n' );
				else                     return c.end( '2\n' );
			}

			c.end(
				 'NT-Password := "' + res.body.users.password + '"\n'
				+'0\n'
			);
		} );
	},

	_auth: function( args, c ) {
		console.log( "BRIDGE: User " + args.user_id + " has been successfully authenticated." );

		// Close socket
		c.end();

		var mac = args.ud_mac.toLowerCase().replace( /-/g, ':' );
		var user = args.user_id;
		var ap = args.ap_id;
		var session = helper.sessionID( args );

		// Try to find UD
		ctrl.get( 'uds?filter[user_id]=' + user + '&filter[mac]=' + mac, function( err, res ) {
			if( err ) return console.error( err );

			var uds = res.body.uds;
			if( uds.length == 1 ) {
				// Found -> Update
				ctrl.put( 'uds/' + uds[0].id, { uds: {
					id: uds[0].id,
					last_ap_id: ap
				} }, function( err, res ) {
					if( err ) return console.error( "BRIDGE: Could not update ud!" );

					// Save ud to session cache
					sessionCache.set( session, {
						ud_id: res.body.uds.id
					} );
					console.log( "BRIDGE: UD " + res.body.uds.id + " updated." );
				} );
			} else {
				// Otherwise --> Create
				ctrl.post( 'uds', { uds: {
					user_id: user,
					mac: mac,
					last_ap_id: ap
				} }, function( err, res ) {
					if( err ) return console.error( "BRIDGE: Could not create ud!" );

					// Save ud to session cache
					sessionCache.set( session, {
						ud_id: res.body.uds.id
					} );
					console.log( "BRIDGE: UD " + res.body.uds.id + " created." );
				} );
			}
		} );
	},

	_acct: function( args, c ) {
		// Close socket
		c.end();

		var mac = args.ud_mac.toLowerCase().replace( /-/g, ':' );
		var user = args.user_id;
		var ap = args.ap_id;
		var ud = null;
		var session = helper.sessionID( args );

		async.waterfall( [
			function( done ) {
				// Wait some time to ensure everything (like UD creation) has been finished.
				// Kind of dirty, but it works
				setTimeout( done, 1000 );
			},
			function( done ) {
				// Ask cache
				sessionCache.get( session, function( err, res ) {
					if( res[ session ] ) ud = res[ session ].ud_id;
					done();
				} );
			},
			function( done ) {
				// If ud is resolved -> Skip
				if( ud ) return done();

				// Otherwise: ask server
				ctrl.get( 'uds?filter[user_id]=' + user + '&filter[mac]=' + mac, function( err, res ) {
					var uds = res.body.uds;
					if( uds.length == 1 ) {
						// Save ud to session cache
						sessionCache.set( session, {
							ud_id: res.body.uds[0].id
						} );

						ud = res.body.uds[0].id;
					}

					done();
				} );
			}
		], function() {
			// If ud is resolved -> Skip
			if( ! ud ) return console.error( "BRIDGE: Could not resolve user device!" );
				
			if( args.type == "start" ) {
				// Create session
				ctrl.post( 'sessions', { sessions: {
					id: session,
					ap_id: ap,
					ud_id: ud
				} }, function( err ) {
					if( err ) return console.error( "BRIDGE: Could not create session!" );
					console.log( "BRIDGE: Session " + session + " created." );
				} );
			} else if( args.type == "stop" ) {
				// Stop session
				ctrl.put( 'sessions/' + session, { sessions: {
					id: session,
					ended: true,
					sent_bytes: parseInt( args.sent ),
					received_bytes: parseInt( args.received )
				} }, function( err ) {
					if( err ) console.error( "BRIDGE: Could not end session!" );
					console.log( "BRIDGE: Session " + session + " stopped." );
				} );
			}
		} );
		
	},

	_nas: function( field, args, c ) {
		console.log( "BRIDGE: NAS (" + field + ") request from " + args.ip );

		// Expand IPv6 address and get the identifier
		var ipv6_id = helper.readIPv6Addr( args.ip ).slice( 4 ).join( ':' );
		ctrl.get( 'aps?filter[ipv6_id]=' + ipv6_id + '&fields=' + field, function( err, res ) {
			if( err || res.body.aps.length != 1 ) return c.end( '' );
			c.end( res.body.aps[0][field] );
		} );
	}
}

module.exports = new Bridge();

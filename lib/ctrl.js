var request = require( 'https' ).request;
var url = require( 'url' );

function Ctrl() {}

Ctrl.prototype = {
	// Init function: sets configuration
	init: function( conf ) {
		this.conf = conf;
		this.curUrl = 0;
		this.errCnt = 0;
	},
	// General request function
	_request: function( endpoint, method, data, done ) {
		var self = this;

		// When done is no function create a dummy
		if( typeof done != "function" ) done = function(){};

		// Check if initialised
		if( ! self.conf ) return done( new Error( "CTRL is not initialised." ) );

		// Create request options
		var opts = url.parse( self.conf.urls[ self.curUrl ] + endpoint );
		opts.ca = self.conf.ca;
		opts.auth = self.conf.user + ':' + self.conf.password;
		opts.method = method;
		if( data ) {
			opts.headers = { 'Content-Type': 'application/vnd.api+json' };
			if( typeof data != "string" ) data = JSON.stringify( data );
		}

		var r = request( opts );
		r.on( 'error', function( err ) {
			console.error( "Connection error: " + err.message );

			self._rotateUrl();

			self.errCnt++;
			if( self.errCnt < 10 ) return self._request( endpoint, method, data, done );
			else                   return done( new Error( "Connection failed." ) );
		} );
		r.on( 'response', function( res ) {
			var body = "";
			res.on( 'data', function( chunk ) { body += chunk.toString(); } );
			res.on( 'end', function() {
				// Handle data and parse if given
				if( body != "" && res.headers['content-type'] == 'application/vnd.api+json' ) {
					body = JSON.parse( body );
				} else {
					body = {};
				}

				// User error occured
				if( res.statusCode >= 400 && res.statusCode < 500 ) {
					if( body.errors ) return done( new Error( body.errors.code ) );
					else              return done( new Error( "Error " + res.statusCode ) );
				}

				// Server error occured
				if( res.statusCode >= 500 ) {
					console.error( "Server error: " + res.statusCode );

					self._rotateUrl();

					self.errCnt++;
					if( self.errCnt < 10 ) return self._request( endpoint, method, data, done );
					else                   return done( new Error( "Error " + res.statusCode ) );
				}

				// Everthing is okay
				this.errCnt = 0;
				done( null, {
					code: res.statusCode,
					body: body
				} );
			} );
		} );
		r.setTimeout( 1000, function() {
			self._rotateUrl();

			self.errCnt++;
			if( self.errCnt < 10 ) return self._reqest( endpoint, method, data, done );
			else                   return done( new Error( "Request timed out." ) );
		} );
		r.end( data );
	},
	// Rotate URL in case of an error
	_rotateUrl: function() {
		this.curUrl++;
		if( this.curUrl >= this.conf.urls.length ) this.curUrl = 0;
		console.log( "Connection error. Rotating URL." );
	},
	// Wrappers for the request function
	get: function( endpoint, done ) {
		this._request( endpoint, 'GET', null, done );
	},
	post: function( endpoint, data, done ) {
		this._request( endpoint, 'POST', data, done );
	},
	put: function( endpoint, data, done ) {
		this._request( endpoint, 'PUT', data, done );
	},
	del: function( endpoint, done ) {
		this._request( endpoint, 'DELETE', null, done );
	}
}

module.exports = new Ctrl();

var exec = require( 'child_process' ).exec;

function Fastd() {}

Fastd.prototype = {
	// Starts FASTD
	start: function( config ) {
	
	},

	// Adds peer
	addPeers: function( peers, done ) {

	},

	// Removes peer
	removePeers: function( peers, done ) {

	},

	// Modifies peer
	modifyPeers: function( peers, done ) {
		// Modifying peers is just removing and adding peers ...
		this.removePeers( peers, function( err, res ) {
			if( err ) return done( err );
			this.addPeers( peers, done );
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

			done( null, {
				privateKey: keys[1],
				publicKey: keys[2]
			} );
		} );
	}
}

module.exports = new Fastd();

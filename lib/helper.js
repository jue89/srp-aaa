var crypto = require( 'crypto' );

module.exports = {
	readIPv6Addr: function( ipv6 ) {
		var ret = [ '0000', '0000', '0000', '0000', '0000', '0000', '0000', '0000' ];
		var ptr = 0;

		ipv6 = ipv6.split( ':' );

		ipv6.forEach( function( i ) {
			if( i == "" ) {
				ptr += 9 - ipv6.length;
				return;
			}

			var tmp = '000' + i;
			ret[ ptr ] = tmp.substr( -4, 4 );
			ptr++;
		} );

		return ret;
	},
	sessionID: function( obj ) {
		var h = crypto.createHash( 'md5' );
		h.update( obj.session );
		h.update( obj.ap_id );
		h.update( obj.user_id );
		h.update( obj.ud_mac );
		return h.digest( 'hex' );
	}
}

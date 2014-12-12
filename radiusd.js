var spawn = require( 'child_process' ).spawn;
var path = require( 'path' );
var fs = require( 'fs' );
var hb = require( 'handlebars' );
var log = require( './lib/log.js' );


var cacheDir = path.resolve( __dirname, 'cache' );
var confFile = cacheDir + '/radiusd.conf';
var dictFile = cacheDir + '/dictionary';
var errFile = fs.createWriteStream( cacheDir + '/radiusd.log', { flags: 'a' } );
var tmplDir = path.resolve( __dirname, 'template' );
var tmplFile = tmplDir + '/radiusd.tpl';

var radiusd;

function Radiusd() {}

Radiusd.prototype = {
	// Starts Freeradius
	start: function( config ) {
		var self = this;

		// Generate config
		self.genConfig( config );

		// Spawn Freeradius
		radiusd = spawn( 'freeradius', [
			'-d', cacheDir,
			'-X'
			//'-f'
		] );
		radiusd.stderr.pipe( errFile );
		radiusd.stdout.pipe( errFile );
		radiusd.on( 'exit', function() {
			log.warn( "Errors occured and RADIUSD stopped" );
			radiusd = null;
			errFile.end();
		} );
		log.debug1( "RADIUSD spawned" );
	},

	// Stops Freeradius
	stop: function( done ) {
		if( ! radiusd ) return done();

		// Setup exit event
		radiusd.removeAllListeners( 'exit' );
		radiusd.on( 'exit', function() {
			log.debug1( "RADIUSD stopped" );
			radiusd = null;
			errFile.end();
			done();
		} );
		
		// Send SIGTERM to radiusd
		radiusd.kill();
	},

	// Generates configuration files
	genConfig: function( config ) {
		// Compile template
		var tpl = hb.compile( fs.readFileSync( tmplFile, 'utf8' ) );

		// Write conf file
		fs.writeFileSync( confFile, tpl( {
			dir: __dirname,
			ipv6_net: config.ipv6_net,
			key: 'aaa.key',
			cert: 'aaa.pem',
			ca: 'cacert.pem',
			dh: 'dh.pem'
		} ) );

		// Write directory file
		fs.writeFileSync( dictFile, "$INCLUDE	/usr/share/freeradius/dictionary" );
	}
}

module.exports = new Radiusd();

prefix = /usr
exec_prefix = /usr
sysconfdir = /etc
localstatedir = /var
sbindir = ${exec_prefix}/sbin
logdir = {{dir}}/cache
raddbdir = {{dir}}/cache
radacctdir = ${logdir}/radacct
name = freeradius
confdir = ${raddbdir}
run_dir = ${localstatedir}/run/${name}
db_dir = ${raddbdir}
libdir = /usr/lib/freeradius
user = freerad
group = freerad

max_request_time = 30
cleanup_delay = 5
max_requests = 1024
listen {
	type = auth
	ipv6addr = ::
	port = 0
}
listen {
	type = acct
	ipv6addr = ::
	port = 0
}
hostname_lookups = no
allow_core_dumps = no
regular_expressions	= yes
extended_expressions	= yes
log {
	destination = stderr
	auth = yes
	auth_badpass = no
	auth_goodpass = no
}

checkrad = ${sbindir}/checkrad

security {
	max_attributes = 200
	reject_delay = 1
	status_server = yes
}
proxy_requests  = no
client dynamic {
	ipv6addr = {{ipv6_net}}
	netmask = 64
	dynamic_clients = dynamic_client_server
	lifetime = 3600
}
server dynamic_client_server {
	authorize {
		if ("%{exec:{{dir}}/wrapper/nas NAME %{Packet-Src-IPv6-Address}}") { # <--
			update control {
				FreeRADIUS-Client-IPv6-Address = "%{Packet-Src-IPv6-Address}"
				FreeRADIUS-Client-Shortname = "%{exec:{{dir}}/wrapper/nas NAME %{Packet-Src-IPv6-Address}}" # <--
				FreeRADIUS-Client-Secret = "%{exec:{{dir}}/wrapper/nas SECRET %{Packet-Src-IPv6-Address}}" # <--
			}
		}
		ok
	}
}
thread pool {
	start_servers = 5
	max_servers = 32
	min_spare_servers = 3
	max_spare_servers = 10
	max_requests_per_server = 0
}
modules {
	always fail {
		rcode = fail
	}
	always reject {
		rcode = reject
	}
	always noop {
		rcode = noop
	}
	always handled {
		rcode = handled
	}
	always updated {
		rcode = updated
	}
	always notfound {
		rcode = notfound
	}
	always ok {
		rcode = ok
		simulcount = 0
		mpp = no
	}
	pap {
		auto_header = no
	}
	exec {
		wait = yes
		input_pairs = request
		shell_escape = yes
		output = none
	}
	exec api-user {
		wait = yes
		program = "{{dir}}/wrapper/user"
		input_pairs = request
		output_pairs = config
		shell_escape = Yes

	}
	exec api-acct {
		wait = yes
		program = "{{dir}}/wrapper/acct"
		input_pairs = request
		shell_escape = Yes
	}
	exec api-auth {
		wait = yes
		program = "{{dir}}/wrapper/auth"
		input_pairs = request
		shell_escape = Yes
	}
	mschap {
	}
	eap {
		default_eap_type = peap
		timer_expire     = 60
		ignore_unknown_eap_types = no
		cisco_accounting_username_bug = no
		max_sessions = 4096
		md5 {
		}
		leap {
		}
		gtc {
			auth_type = PAP
		}
		tls {
			certdir = {{dir}}/config
			cadir = ${certdir}
			private_key_file = ${certdir}/{{key}}
			certificate_file = ${certdir}/{{cert}}
			CA_file = ${cadir}/{{ca}}
			dh_file = ${certdir}/{{dh}}
			random_file = /dev/urandom
			CA_path = ${cadir}
			cipher_list = "DEFAULT"
			ecdh_curve = "prime256v1"
			cache {
			      enable = no
			      lifetime = 24 # hours
			      max_entries = 255
			}
		}
		ttls {
			default_eap_type = gtc
			copy_request_to_tunnel = no
			use_tunneled_reply = no
			virtual_server = "inner-tunnel"
		}
		peap {
			default_eap_type = mschapv2
			copy_request_to_tunnel = no
			use_tunneled_reply = no
			virtual_server = "inner-tunnel"
		}
		mschapv2 {
		}
	}
}
instantiate {
	exec
}

authorize {
	mschap
	eap {
		ok = return
	}
	api-user
	pap
}
authenticate {
	Auth-Type PAP {
		pap
	}
	Auth-Type MS-CHAP {
		mschap
	}
	eap
}
preacct {
}
accounting {
	api-acct
}
session {
}
post-auth {
	api-auth
}
server inner-tunnel {
	listen {
	       ipaddr = 127.0.0.1
	       port = 18120
	       type = auth
	}
	authorize {
		mschap
		update control {
		       Proxy-To-Realm := LOCAL
		}
		eap {
			ok = return
		}
		api-user
		pap
	}
	authenticate {
		Auth-Type PAP {
			pap
		}
		Auth-Type MS-CHAP {
			mschap
		}
		eap
	}
	session {
	}

	post-auth {
	}
}

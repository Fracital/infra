#!/usr/bin/perl

# Local regression test for CVE-2026-123007 (nginx e27f5fa84, "HTTP/2:
# account for queued frames when validating WINDOW_UPDATE").
# DATA frames queued but not yet written still belong to the client's view
# of the connection window, so a WINDOW_UPDATE that would take
# send_window + queued past 2^31-1 must be a FLOW_CONTROL_ERROR.
# Not part of nginx-tests; written for the OpenResty 1.31.8.1 backport.

###############################################################################

use warnings;
use strict;

use Test::More;

use Socket qw/ SOL_SOCKET SO_RCVBUF /;

BEGIN { use FindBin; chdir($FindBin::Bin); }

use lib 'lib';
use Test::Nginx;
use Test::Nginx::HTTP2;

###############################################################################

select STDERR; $| = 1;
select STDOUT; $| = 1;

plan(skip_all => 'win32') if $^O eq 'MSWin32';

my $t = Test::Nginx->new()->has(qw/http http_v2/)->plan(4)
	->write_file_expand('nginx.conf', <<'EOF');

%%TEST_GLOBALS%%

daemon off;

events {
}

http {
    %%TEST_GLOBALS_HTTP%%

    http2 on;

    server {
        listen       127.0.0.1:8080 sndbuf=4k;
        server_name  localhost;

        error_log %%TESTDIR%%/h2.log info;

        location / {
            output_buffers 1 4m;
        }
    }
}

EOF

$t->write_file('big.html', 'x' x 2**23);
$t->write_file('t.html', 'SEE-THIS');
$t->run();

###############################################################################

# control: nothing queued, raising the window to exactly 2^31-1 is legal

my $s = Test::Nginx::HTTP2->new();
$s->h2_window(2**31 - 1 - 65535);
my $sid = $s->new_stream({ path => '/t.html' });
my $frames = $s->read(all => [{ sid => $sid, fin => 1 }], wait => 1);

my ($frame) = grep { $_->{type} eq 'GOAWAY' } @$frames;
is($frame, undef, 'max window, nothing queued - no GOAWAY');
($frame) = grep { $_->{type} eq 'DATA' } @$frames;
is($frame && $frame->{data}, 'SEE-THIS', 'max window, nothing queued - data');

# queued: the client opens a large window, requests 8 MB and stops reading
# after HEADERS; nginx frames a 4 MB output buffer at once, so megabytes of
# DATA sit in its queue while the kernel holds at most a few hundred KB.
# With W0 the window the client granted and R the DATA bytes it has read,
# nginx's send_window is W0 - framed, framed = R + in_kernel + queued.
# The increment MAX - W0 + R + 1 MB is legal if queued DATA is ignored
# (old check, in_kernel + queued >= 1 MB) and illegal once queued DATA is
# counted as part of the window (fixed check, in_kernel < 1 MB).

my $W0 = 2**24 + 65535;

$s = Test::Nginx::HTTP2->new();
$s->{socket}->setsockopt(SOL_SOCKET, SO_RCVBUF, 16384) or die $!;
$s->h2_settings(0, 0x4 => 2**24);
$s->h2_window(2**24);
$sid = $s->new_stream({ path => '/big.html' });
$frames = $s->read(all => [{ sid => $sid, fin => 0x4 }]);
select undef, undef, undef, 0.5;

my $R = 0;
$R += $_->{length} for grep { $_->{type} eq 'DATA' } @$frames;

$s->h2_window(2**31 - 1 - $W0 + $R + 2**20);
$frames = $s->read(all => [{ sid => $sid, fin => 1 }], wait => 3);

# the fixed check closes the connection with FLOW_CONTROL_ERROR; the GOAWAY
# itself may be lost behind the full socket, so look at the stream outcome
# and the error log

($frame) = grep { $_->{type} eq 'DATA' && $_->{flags} & 1 } @$frames;
is($frame, undef, 'max window, frames queued - stream aborted');

($frame) = grep { $_->{type} eq 'GOAWAY' } @$frames;
diag('GOAWAY ' . ($frame ? "code $frame->{code}" : 'not received'));

like($t->read_file('h2.log'),
	qr/client violated connection flow control: received WINDOW_UPDATE/,
	'max window, frames queued - flow control error logged');

###############################################################################

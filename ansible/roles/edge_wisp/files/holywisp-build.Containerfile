# Build image for holyWisp (roles/edge_wisp/tasks/build.yml). Debian 12 because the controller
# (Fedora) ships no static glibc or libcrypt, and Debian 11's backports (the only cmake >= 3.20 for
# bullseye) are gone from deb.debian.org. A -static binary built here carries its own libc, so it
# runs on the Debian 11 (glibc 2.31) edge as well as on 12 and 13. Nothing from this image reaches
# the hosts except the binary it produces.
FROM docker.io/library/debian:12
RUN set -eux; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        gcc libc6-dev libcrypt-dev cmake ninja-build make file; \
    rm -rf /var/lib/apt/lists/*

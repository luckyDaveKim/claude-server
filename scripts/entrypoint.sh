#!/bin/bash
set -e

cd /home/node/app
exec node dist/index.js

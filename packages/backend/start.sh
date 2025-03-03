#!/bin/bash
export PORT=9234
export HOSTNAME=ide.wjpython.bdware.cn
source ../../pyvenv/bin/activate
pm2 start dist/index.js

#!/bin/zsh
set -e
task_dir="${0:A:h}"
task_node="/Users/victor/.nvm/versions/node/v20.20.2/bin/node"
"$task_node" "$task_dir/manage.cjs" start
open "http://127.0.0.1:18514/?section=planning"

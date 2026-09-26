#!/bin/zsh
set -e
task_dir="${0:A:h}"
task_node="/Users/victor/.nvm/versions/node/v20.20.2/bin/node"
"$task_node" "$task_dir/manage.cjs" stop

# Capstone 2, after step 2: ~/log-tool is a Git repository, pushed to github.com/learner/log-tool.
cd ~/log-tool
git init -q -b main
printf '*.log\n' > .gitignore
printf '# log-tool\n\nSummarises an nginx access log.\n' > README.md
git add . && git commit -qm "First version of logsum"
gh repo create log-tool --public --source . --push > /dev/null 2>&1
cd ~

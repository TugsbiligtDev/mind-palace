# Capstone 2, after steps 3 and 4: ShellCheck CI on main, and a ruleset protecting main.
cd ~/log-tool
mkdir -p .github/workflows
printf 'name: CI\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  shellcheck:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: ShellCheck\n        run: shellcheck *.sh\n' > .github/workflows/ci.yml
git add .github && git commit -qm "Run ShellCheck on every push and pull request" && git push -q 2> /dev/null
printf '{"name":"Protect main","target":"branch","enforcement":"active","conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"deletion"},{"type":"non_fast_forward"},{"type":"pull_request","parameters":{"required_approving_review_count":0}},{"type":"required_status_checks","parameters":{"required_status_checks":[{"context":"shellcheck"}]}}]}\n' > /tmp/rules.json
gh api repos/learner/log-tool/rulesets --input /tmp/rules.json > /dev/null && rm /tmp/rules.json
cd ~

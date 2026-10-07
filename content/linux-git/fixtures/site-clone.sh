# The learner's own clone of Inkwell's website at ~/site, with one open issue (#1) on GitHub.
# Needs git-identity, website-repo, github-account and github-site first.
git config --global pull.rebase false
git clone -q git@github.com:inkwell/site.git ~/site 2> /dev/null
cd ~/site
gh issue create --title "Update the number of books on the about page" --body "It should say twenty thousand." > /dev/null 2>&1

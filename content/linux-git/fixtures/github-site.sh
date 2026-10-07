# Inkwell's website on GitHub (github.com/inkwell/site), pushed from Kenji's copy. The learner's
# own copy isn't there yet. Needs the git-identity, website-repo and github-account fixtures first.
git init -q --bare -b main /srv/git/github.com/inkwell/site.git
cd ~/inkwell/site-repo
git remote add origin git@github.com:inkwell/site.git
git push -q -u origin main 2> /dev/null
cd ~ && rm -rf ~/inkwell/site-repo

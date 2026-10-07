# The Inkwell website as a Git repository with a few weeks of history (Module 17's review and
# later). Commits are made by the people who really made them, on the days they made them.
mkdir -p ~/inkwell/site-repo && cd ~/inkwell/site-repo
git init -q -b main
git config user.name "Priya Shah" && git config user.email "priya@inkwell.example"
commit() { GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$2" GIT_AUTHOR_DATE="$3" GIT_COMMITTER_NAME="$1" GIT_COMMITTER_EMAIL="$2" GIT_COMMITTER_DATE="$3" git commit -qm "$4"; }

printf '<!DOCTYPE html>\n<title>Inkwell Books</title>\n<link rel="stylesheet" href="style.css">\n<h1>Inkwell Books</h1>\n<p>Second-hand books, posted worldwide.</p>\n' > index.html
printf 'h1 { color: navy; }\n' > style.css
git add . && commit "Priya Shah" priya@inkwell.example "2026-08-03 10:12:00" "Add the home page"

printf '<!DOCTYPE html>\n<title>About Inkwell</title>\n<h1>About us</h1>\n<p>Three people, a lot of books.</p>\n<a href="index.htm">Home</a>\n' > about.html
git add about.html && commit "Kenji Mori" kenji@inkwell.example "2026-08-20 15:40:00" "Add the about page"

sed -i 's/index.htm"/index.html"/' about.html
git add about.html && commit "Priya Shah" priya@inkwell.example "2026-09-01 09:05:00" "Fix the Home link on the about page"

printf 'PAYMENT_KEY=pk-inkwell-7f3a-NOT-A-REAL-KEY\nREFUND_APPROVER=kmori\n' > .env
printf '// Checkout settings come from .env\nconst approver = process.env.REFUND_APPROVER;\n' > checkout.js
git add .env checkout.js && commit "Marcus Reed" marcus@inkwell.example "2026-09-14 22:10:00" "Add checkout settings"

mkdir -p books && printf '<!DOCTYPE html>\n<title>Dune</title>\n<h1>Dune</h1>\n<p class="price">9.99</p>\n' > books/dune.html
git add books && commit "Kenji Mori" kenji@inkwell.example "2026-09-20 11:30:00" "Add the Dune book page"

sed -i 's/9.99/8.99/' books/dune.html
git add books && commit "Priya Shah" priya@inkwell.example "2026-10-01 16:45:00" "Lower the price of Dune"
git config --unset user.name && git config --unset user.email
cd ~

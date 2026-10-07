# Inkwell Books' shared back-office folder, as the learner first finds it: a bit of a mess.
# Used by the Part 1 and Part 2 lessons (fixture: backoffice).
mkdir -p ~/inkwell/orders ~/inkwell/notes ~/inkwell/logs ~/inkwell/site/images ~/inkwell/old
cat > ~/inkwell/README.txt <<'TXT'
INKWELL BOOKS - shared files
============================
orders/  one CSV file of orders per month
notes/   meeting notes, to-do lists
logs/    what the web shop writes while it runs
site/    the website
old/     things nobody dared to delete
Ask Kenji before deleting anything!
TXT
cat > ~/inkwell/orders/2026-08.csv <<'TXT'
order_id,date,customer,book,price
1041,2026-08-03,Amara Okafor,Dune,9.99
1042,2026-08-04,Liam Chen,The Hobbit,8.50
1043,2026-08-11,Sofia Rossi,Beloved,11.00
1044,2026-08-19,Daniel Novak,Dune,9.99
TXT
cat > ~/inkwell/orders/2026-09.csv <<'TXT'
order_id,date,customer,book,price
1045,2026-09-01,Amara Okafor,Kindred,10.50
1046,2026-09-02,Kenji Mori,Dune,9.99
1047,2026-09-09,Liam Chen,Circe,12.00
1048,2026-09-15,Priya Shah,The Hobbit,8.50
1049,2026-09-28,Sofia Rossi,Dune,9.99
TXT
cat > ~/inkwell/notes/todo.txt <<'TXT'
- reorder Dune (only 2 left)
- fix the broken link on the About page
- ask Marcus about the September refunds
TXT
cat > ~/inkwell/notes/meeting-2026-09-30.txt <<'TXT'
Meeting, 30 September
Present: Kenji, Priya, Marcus
- Website: new book page goes live next week.
- Refunds: two refunds nobody remembers approving. Kenji to check.
- Server: Priya will tidy the shared folder "one of these days".
TXT
cat > ~/inkwell/logs/shop.log <<'TXT'
2026-10-05 08:00:01 INFO  shop started
2026-10-05 08:02:13 INFO  order 1050 paid
2026-10-05 09:15:40 WARN  stock low: Dune (2 left)
2026-10-05 10:21:07 ERROR payment failed for order 1051
2026-10-05 10:21:09 INFO  order 1051 retried
2026-10-05 11:42:55 INFO  order 1051 paid
2026-10-05 13:03:30 ERROR could not send email to customer 18
2026-10-05 14:30:00 INFO  backup finished
TXT
printf '<!DOCTYPE html>\n<title>Inkwell Books</title>\n<h1>Inkwell Books</h1>\n' > ~/inkwell/site/index.html
printf 'h1 { color: navy; }\n' > ~/inkwell/site/style.css
printf 'PNG' > ~/inkwell/site/images/logo.png
printf 'Dune 9.99\nThe Hobbit 8.50\n' > ~/inkwell/old/price-list-OLD.txt
printf 'see attached\n' > ~/inkwell/old/'copy of copy of notes.txt'

# The web server's access log: who asked for which page, and how it went (status code).
cat > ~/inkwell/logs/access.log <<'TXT'
203.0.113.7 - [05/Oct/2026:08:01:12] "GET / HTTP/1.1" 200
203.0.113.7 - [05/Oct/2026:08:01:13] "GET /style.css HTTP/1.1" 200
198.51.100.23 - [05/Oct/2026:08:14:55] "GET /books/dune HTTP/1.1" 200
198.51.100.23 - [05/Oct/2026:08:15:40] "POST /cart HTTP/1.1" 200
192.0.2.44 - [05/Oct/2026:09:02:03] "GET /about HTTP/1.1" 404
203.0.113.7 - [05/Oct/2026:09:30:21] "GET /books/circe HTTP/1.1" 200
192.0.2.44 - [05/Oct/2026:09:31:09] "GET /admin HTTP/1.1" 403
192.0.2.44 - [05/Oct/2026:09:31:15] "GET /admin/login HTTP/1.1" 403
198.51.100.23 - [05/Oct/2026:10:21:06] "POST /checkout HTTP/1.1" 500
198.51.100.23 - [05/Oct/2026:10:21:30] "POST /checkout HTTP/1.1" 200
203.0.113.90 - [05/Oct/2026:11:05:47] "GET /books/dune HTTP/1.1" 200
203.0.113.90 - [05/Oct/2026:11:06:02] "GET /about HTTP/1.1" 404
192.0.2.10 - [06/Oct/2026:02:13:44] "POST /admin/refund?order=1044 HTTP/1.1" 200
192.0.2.10 - [06/Oct/2026:02:14:09] "POST /admin/refund?order=1046 HTTP/1.1" 200
203.0.113.7 - [06/Oct/2026:08:00:31] "GET / HTTP/1.1" 200
TXT
# One line per book sold this week (for sort and uniq).
printf 'Dune\nThe Hobbit\nDune\nCirce\nKindred\nDune\nCirce\nBeloved\nThe Hobbit\nDune\n' > ~/inkwell/notes/books-sold.txt
# The shop's own record of refunds, readable only by root.
mkdir -p /var/log/inkwell
cat > /var/log/inkwell/refunds.log <<'TXT'
2026-09-12 14:02:11 refund order=1039 amount=8.50 approved_by=priya reason="damaged in post"
2026-10-06 02:13:44 refund order=1044 amount=9.99 approved_by=kmori reason=""
2026-10-06 02:14:09 refund order=1046 amount=9.99 approved_by=kmori reason=""
TXT
chmod 640 /var/log/inkwell/refunds.log

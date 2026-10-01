# Ethical Hacking Course Plan

The owner's full roadmap for the Ethical Hacking / Penetration Testing course: 37 modules across three levels, plus a capstone project per level. Each module is one lesson on the site with its own knowledge check. Lessons live in `content/ethical-hacking/<level>/<folder>/`. Course id: `ethical-hacking`.

The whole point of this course is in one line (already the course tagline): **learn how attacks work, so you can defend against them.** Every lesson is framed for the defender and the authorised tester. Nothing here is a copy-paste weapon.

🔹 = a brief, recognition-only item (a short "just recognize it" note in the lesson).

## Status

| Level | Modules | Status |
|---|---|---|
| Beginner: Fundamentals | 1–13, three case reviews, capstone | **Built** (branch `content/ethical-hacking-beginner`) |
| Intermediate: Essential+ | 14–27, reviews, capstone | Planned (not built yet) |
| Advanced: Mastery | 28–37, reviews, capstone | Planned (not built yet) |

Build order follows the other courses: Beginner first, then Intermediate once the owner has seen and approved Beginner on a preview link.

## This course is different: no code runs in the browser

Python, DSA and PostgreSQL all run the learner's *code* in the browser and auto-grade it. Ethical hacking can't work that way, for two reasons:

1. **You can't run the tools in a browser.** Nmap, Wireshark, Metasploit, Burp Suite, a Kali VM — none of these run on a web page, and they shouldn't. They need a real operating system and a real (legal, isolated) lab.
2. **You must not practise on anything you don't own.** The hands-on work happens in the learner's own lab (a Kali VM plus a deliberately-vulnerable target VM) or on sanctioned practice ranges (TryHackMe, Hack The Box, `scanme.nmap.org`). The site teaches and tests understanding; it never attacks anything.

So this course uses a fourth **engine type: `none`** (a "reading" course). Concretely:

- **Lessons** are built from `explain` steps (the teaching), `info` steps (🔹 recognition-only asides), a `why` step and a `recap` step — the same step kinds the code courses use for their prose. No `try`/`code` steps (those need a runner).
- **Safe hands-on** uses the existing `mac` step: the learner runs a genuinely safe, legal command on their own Mac — `dig`, `whois`, `nslookup`, `ping`, `traceroute`, `openssl`, `shasum`, and `nmap` **only against `scanme.nmap.org`** (the host Nmap's maintainers provide expressly for legal scan practice) or against their own machine. These steps are optional ("I ran it ✓" / "Skip for now"); they never ask the learner to touch a third party.
- **Knowledge checks** are multiple-choice (`mcq`) and occasionally fill-in-the-blank with `runnable: false` (a term, not code to run). No `predict` questions (those run code).
- **The content check** (`pnpm check:content`) validates every file against the schema and enforces the no-runner rules for this engine: no `try`/`code` lesson steps, no `predict` quiz questions, and `fill` questions must be `runnable: false`. There is nothing to execute, so the check is a structural + schema check, not a "run it" check.

### The lab (hands-on, off-site)

Real practice happens in a free, isolated home lab the learner builds once and reuses:

- **Kali Linux** in a free VM (VirtualBox or UTM on Apple Silicon) — the attacker box.
- **One deliberately-vulnerable target** on the same host-only/NAT network (e.g. a purpose-built training VM), so all traffic stays inside the learner's own machine.
- **Sanctioned online ranges** for when a local VM isn't enough: TryHackMe, Hack The Box, `scanme.nmap.org`, PortSwigger Web Security Academy.

The Beginner capstone is *building this lab* and running authorised recon against the learner's own target. Lessons point to it; the site doesn't host or require it.

### Practice hub

No runnable case files for this course yet (the hub's cases all auto-grade code/SQL, which this engine can't do). The practice hub stays empty for ethical hacking in v1; scenario-style case files can be added later if we design a non-runnable case type. This matches the other courses, which also have no live hub cases yet.

### Legal and ethical framing (non-negotiable)

- Module 12 (Ethics, Law & Authorization) is taught **before** any scanning or exploitation module, and its ideas are repeated as reminders throughout.
- Every hands-on prompt names a target the learner is explicitly allowed to touch (their own lab, `scanme.nmap.org`, a range they signed up for).
- The course states plainly: testing a system without written authorisation is a crime (e.g. the US Computer Fraud and Abuse Act and equivalents elsewhere), and "I was just learning" is not a defence.

---

## Beginner: Fundamentals

*Season goal: go from "I've never used a terminal" to "I can set up a lab and safely, legally map a target I'm allowed to test."*

### Part 1: Computing & OS Foundations

| # | Module | Folder | Covers |
|---|---|---|---|
| 1 | How Computers Work | `01-how-computers-work` | Hardware basics (CPU, RAM, storage); binary & hexadecimal; what an operating system does (processes, files, memory); what a virtual machine (VM) is and why security work happens inside VMs; client vs. server |
| 2 | Operating Systems Overview | `02-operating-systems` | Windows vs. Linux vs. macOS differences; filesystems; users, permissions, and "root"/admin; why Linux dominates offensive security |

### Part 2: Linux Essentials *(prerequisite for everything after)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 3 | Linux Command Line Basics | `03-linux-command-line` | The shell/terminal; navigating (`cd`, `ls`, `pwd`); working with files (`cat`, `less`, `cp`, `mv`, `rm`, `mkdir`, `touch`); searching (`find`, `grep`); reading help (`man`, `--help`); the danger of destructive commands like `rm` |
| 4 | Users, Permissions & Processes | `04-users-permissions-processes` | Users/groups, `sudo` and root; file permissions (rwx, `chmod`, `chown`, octal); viewing/killing processes (`ps`, `top`, `kill`); installing software (`apt`); services (`systemctl`) |
| 5 | Bash Scripting Basics | `05-bash-scripting` | Variables; input/arguments; conditionals and loops; pipes and redirection (`|`, `>`, `>>`); small automation scripts; common mistakes (quoting, missing execute permission) |

✅ **Case review `review-1-linux`:** five scenarios mixing Modules 3–5 — read the output, pick the safe command, spot the destructive one.

### Part 3: Networking Foundations *(prerequisite for all scanning)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 6 | Networking Core | `06-networking-core` | OSI vs. TCP/IP models; IP addresses, subnets & CIDR; MAC addresses; packets, routers, switches; private vs. public IPs, NAT; 🔹 IPv6 (recognition only) |
| 7 | Ports & Protocols | `07-ports-protocols` | TCP vs. UDP; the TCP three-way handshake; common ports and services (HTTP/HTTPS, SSH, FTP, DNS, SMB, RDP, SMTP); DNS resolution; DHCP |
| 8 | Network Tools & Traffic Analysis | `08-network-tools` | `ping`, `traceroute`, `ip`/`ifconfig`, `netstat`/`ss`, `dig`/`nslookup`; capturing and reading packets in Wireshark (filters, following a stream) |

✅ **Case review `review-2-networking`:** read a `dig` answer, a CIDR range and a Wireshark capture; match ports to services.

### Part 4: The Web & How It Works *(prerequisite for web hacking)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 9 | How the Web Works | `09-how-the-web-works` | HTTP/HTTPS request–response cycle; methods (GET, POST); status codes; headers; cookies & sessions; URL structure; HTML/CSS/JavaScript at a recognition level |
| 10 | Web Infrastructure | `10-web-infrastructure` | Web servers; databases and what SQL is; APIs and REST basics; TLS/certificates (what HTTPS actually protects); using browser developer tools to inspect requests |

### Part 5: Security & the Hacking Mindset

| # | Module | Folder | Covers |
|---|---|---|---|
| 11 | Security Fundamentals | `11-security-fundamentals` | The CIA triad; vulnerability vs. threat vs. risk; authentication vs. authorization; hashing vs. encryption vs. encoding; major attack categories |
| 12 | Ethics, Law & Authorization | `12-ethics-law-authorization` | Scope and rules of engagement; written permission; relevant law (US CFAA and equivalents); responsible disclosure; how bug bounty vs. pentest vs. red team differ in authorization |
| 13 | The Penetration Testing Methodology | `13-pentest-methodology` | The phases — reconnaissance → scanning/enumeration → exploitation → post-exploitation → reporting; passive vs. active; a first tour of Kali Linux and its toolset |

✅ **Case review `review-3-security-ethics`:** given a scenario, decide whether it's authorised, which phase it belongs to, and which security property is at risk.

🏁 **Capstone `capstone-1-home-lab`:** plan and build a legal home lab (Kali VM + one vulnerable target on an isolated network), then run passive and active recon against *your own* target and write up what you found. Guided lesson + checklist + knowledge check; the lab work itself happens off-site.

---

## Intermediate: Essential+  *(planned, not built)*

### Part 6: Reconnaissance & Enumeration
- **14 — Passive Recon / OSINT** (`14-passive-recon-osint`): Google dorking; WHOIS; DNS and subdomain enumeration; Shodan; gathering public information without touching the target. *Prereq: 7.*
- **15 — Active Scanning with Nmap** (`15-nmap-scanning`): host discovery; TCP/UDP scan types; service & version detection; OS detection; the Nmap Scripting Engine (NSE); timing; reading output. *Prereq: 7, 14.*
- **16 — Service Enumeration** (`16-service-enumeration`): digging into discovered services (SMB, FTP, SSH, HTTP, DNS, SMTP, databases); banner grabbing; mapping the real attack surface. *Prereq: 15.*

### Part 7: Vulnerabilities & Exploitation
- **17 — Vulnerability Assessment** (`17-vulnerability-assessment`): what CVEs and CVSS scores mean; finding known vulnerabilities; scanners (Nessus, OpenVAS); searchsploit / Exploit-DB; automated vs. manual verification.
- **18 — Exploitation with Metasploit** (`18-metasploit`): msfconsole workflow; exploits, payloads and listeners; exploiting a known vulnerability *in your lab*; Meterpreter basics; common mistakes (wrong payload/architecture). *Prereq: 17.*
- **19 — Password Attacks** (`19-password-attacks`): how password hashes work; offline cracking (hashcat, John the Ripper); wordlists (rockyou); dictionary vs. brute force; online attacks (hydra); credential reuse and spraying.

### Part 8: Web Application Hacking
- **20 — Web Hacking Toolkit & OWASP** (`20-owasp-toolkit`): the OWASP Top 10 as a map; Burp Suite (proxy, intercept, Repeater, Intruder); content/directory discovery (gobuster, ffuf). *Prereq: 9, 10.*
- **21 — Common Web Vulnerabilities I** (`21-web-vulns-1`): SQL injection; cross-site scripting (reflected & stored); command injection — understanding, finding and defending each. *Prereq: 20.*
- **22 — Common Web Vulnerabilities II** (`22-web-vulns-2`): broken authentication & session flaws; IDOR / broken access control; insecure file upload; SSRF; CSRF; 🔹 XXE (brief). *Prereq: 21.*

### Part 9: Post-Exploitation
- **23 — Post-Exploitation Basics** (`23-post-exploitation`): what to do after a foothold; situational awareness; stabilizing a shell; looting credentials/data; Linux vs. Windows targets.
- **24 — Privilege Escalation** (`24-privilege-escalation`): Linux privesc (SUID binaries, cron jobs, sudo misconfigs, writable files); Windows privesc (service misconfigs, tokens, unquoted paths); automated enumeration (LinPEAS, WinPEAS). *Prereq: 23.*
- **25 — Pivoting & Tunneling** (`25-pivoting-tunneling`): using a compromised host to reach internal networks; port forwarding; SOCKS proxies; tunneling tools. *Prereq: 6, 7, 23.*

### Part 10: Practice & Reporting
- **26 — CTFs & Practice Platforms** (`26-ctfs-practice`): working through TryHackMe and Hack The Box boxes; building a repeatable methodology; learning from writeups.
- **27 — Documentation & Reporting** (`27-reporting`): note-taking during an engagement; writing a findings report; severity/risk ratings; clear remediation advice; why the report is the real deliverable.

🏁 **Intermediate capstone:** fully compromise an intentionally-vulnerable machine end-to-end in your lab (recon → exploit → privilege escalation → root) and write a professional-style penetration-test report.

---

## Advanced: Mastery  *(planned, not built)*

### Part 11: Active Directory & Enterprise Windows
- **28 — Active Directory Fundamentals** (`28-ad-fundamentals`): domains, forests, users, groups; Kerberos and NTLM; why nearly every corporate network runs on AD. *Prereq: 2.*
- **29 — Active Directory Attacks** (`29-ad-attacks`): domain enumeration with BloodHound; Kerberoasting; AS-REP roasting; pass-the-hash; lateral movement; real-world misconfigurations. *Prereq: 28.*

### Part 12: Advanced Exploitation
- **30 — Scripting for Hackers (Python)** (`30-scripting-python`): sockets, HTTP requests and automation in Python; writing custom tooling; reading and adapting public proof-of-concept exploits. *Prereq: 5.*
- **31 — Binary Exploitation Basics** (`31-binary-exploitation`): stack and memory layout; stack-based buffer overflow; fuzzing; controlling execution flow (EIP/RIP); the shellcode concept; 🔹 modern mitigations ASLR/DEP (recognition only).
- **32 — Advanced Web Exploitation** (`32-advanced-web`): chaining vulnerabilities; insecure deserialization; advanced/blind SQL injection; authentication bypasses; API security testing; 🔹 basic WAF evasion (brief). *Prereq: 21, 22.*

### Part 13: Evasion, C2 & Red Teaming
- **33 — AV/EDR Evasion Concepts** (`33-evasion-concepts`): how antivirus and EDR detect threats; payload obfuscation and encoding concepts; evasion principles; 🔹 custom malware development (recognition only, concept not code).
- **34 — Command & Control and Red Teaming** (`34-c2-red-teaming`): C2 frameworks; phishing and social engineering; the assume-breach model; red vs. blue teams; OPSEC; the MITRE ATT&CK framework. *Prereq: 23.*

### Part 14: Specializations & Profession
- **35 — Wireless & Network Attacks** (`35-wireless-attacks`): Wi-Fi security and WPA2 handshake cracking (concept + your own network only); man-in-the-middle; ARP spoofing; 🔹 Bluetooth/RF attacks (recognition only). *Prereq: 6.*
- **36 — Cloud & Container Security Intro** (`36-cloud-container`): common AWS/Azure misconfigurations; IAM weaknesses; Docker/container basics and attack surface.
- **37 — Career & Certifications** (`37-career-certs`): OSCP, PNPT and CEH compared; choosing a specialization (web, red team, cloud, AD); bug bounty platforms; building a portfolio of writeups; staying current.

🏁 **Advanced capstone:** complete a multi-machine Active Directory lab (domain compromise) or a realistic red-team-style engagement, and produce a full client-grade report.

---

## Final skills (what the learner can do at each gate)

- **After Beginner:** comfortable in Linux and the terminal; understands networking, the web and core security concepts; can set up a lab and perform reconnaissance and scanning on a target safely and legally.
- **After Intermediate:** can run a complete assessment against a single target — enumerate services, exploit known vulnerabilities, attack web apps, escalate privileges, and write a clear report.
- **After Advanced:** can attack realistic enterprise environments (Active Directory), write custom scripts, understand binary exploitation and evasion, operate in red-team scenarios, and pursue a certification like OSCP or PNPT.

## Deliberately not covered (deferred)

Advanced binary exploitation (ROP chains, heap, format strings); kernel & driver exploitation; reverse engineering and deep malware analysis; custom C2 framework development; deep mobile (iOS/Android) pentesting; hardware/IoT/firmware; ICS/SCADA & OT; full modern-mitigation bypass at depth; advanced cloud red teaming at depth; Web3 / smart-contract auditing; advanced cryptanalysis; deep source-code review / SAST; physical security & lock picking; purple teaming / detection engineering at depth.

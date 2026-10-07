# আস-সুন্নাহ ফাউন্ডেশন — প্রকল্প-প্ল্যাটফর্ম

ঘর নির্মাণ, স্বাবলম্বী, দক্ষতাভিত্তিক উদ্যোক্তা — প্রতিটি প্রকল্পের উপকারভোগীদের তালিকা দেখানোর পাবলিক সাইট। সাথে আছে রেকর্ড, ছবি আর প্রকল্প সামলানোর এডমিন প্যানেল। নতুন প্রকল্প এডমিন প্যানেল থেকেই খোলা যায়, কোড লাগে না।

এই পাতা নতুনদের জন্য: অ্যাপ চালানো আর Claude Code দিয়ে নতুন ফিচার যোগ করা। কারিগরি খুঁটিনাটি আছে [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)-এ (ইংরেজিতে)।

## যা লাগবে

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — ইনস্টল করে চালু রাখুন। অ্যাপ চালাতে এটুকুই যথেষ্ট।
- [git](https://git-scm.com/downloads) — কোড নামাতে।
- [Claude Code](https://claude.com/claude-code) — ফিচার যোগ করতে।

## ১. অ্যাপ চালান

টার্মিনাল খুলে:

```bash
git clone https://github.com/rajuofficialasf-hub/house-construction.git
cd house-construction
docker compose up
```

প্রথমবার কয়েক মিনিট লাগে। লগে `housing API listening` দেখলে ব্রাউজারে খুলুন http://localhost:5173 — নমুনা প্রকল্প আর রেকর্ড দেখা যাবে।

বন্ধ করতে টার্মিনালে `Ctrl+C` চাপুন। পরের বার শুধু `docker compose up`।

## ২. নিজের লগইন খুলুন

সাইন-আপ পাতা নেই; লগইন খোলা হয় কমান্ড দিয়ে। অ্যাপ চলা অবস্থায় আরেকটা টার্মিনাল খুলে, একই ফোল্ডারে (ইমেইল আর নামের জায়গায় নিজেরটা বসান):

```bash
docker compose exec api npm run admin -- create --email you@example.org --name "Your Name" --role main_admin
```

পাসওয়ার্ড দুবার চাইবে। টাইপ করার সময় কিছু দেখা যায় না, এটাই স্বাভাবিক। আসল কোনো পাসওয়ার্ড দেবেন না, শুধু এই কাজের জন্য আলাদা একটা দিন।

তারপর লগইন করুন: http://localhost:5173/admin/login

## ৩. Claude Code দিয়ে ফিচার যোগ করুন

১. প্রথমবার Claude Code-এ আস-সুন্নাহর প্লাগইন বসান। এর রিপো প্রাইভেট, তাই আগে GitHub-এ `forhad-h/assunnah-engineering` দেখার অনুমতি লাগবে। প্লাগইন ছাড়াও Claude Code চলে, তবে নিচের `/ae-…` কমান্ডগুলো থাকে না।

   ```
   /plugin marketplace add forhad-h/assunnah-engineering
   /plugin install assunnah-engineering@assunnah
   ```

২. প্রজেক্টের ফোল্ডারে `claude` চালান। প্রজেক্টের নিয়ম Claude নিজেই পড়ে নেয় ([CLAUDE.md](CLAUDE.md))।

৩. কী চান, সহজ ভাষায় বলুন, বাংলা বা ইংরেজিতে। যেমন: "রেকর্ডের তালিকায় মোবাইল নম্বর দিয়ে খোঁজার ব্যবস্থা চাই।"

৪. বড় কাজ এই ক্রমে করুন:
   - `/ae-brainstorm` — কী বানাবেন, ঠিক করা
   - `/ae-plan` — কীভাবে বানাবেন, তার পরিকল্পনা
   - `/ae-work` — বানানো, টেস্ট আর রিভিউ

   ছোট কাজ সরাসরি বললেই হয়; টেস্ট Claude নিজেই চালায়।

৫. শেষে ব্রাউজারে নিজে দেখে নিন ঠিকমতো চলছে কি না। তারপর Claude-কে বলুন কমিট করতে। নিজের ব্রাঞ্চে কাজ করুন, `main`-এ সরাসরি পুশ করবেন না।

## সমস্যা হলে

- **"Cannot connect to the Docker daemon"**: Docker Desktop চালু করুন।
- **"port is already allocated"**: 5173, 3001 বা 5432 পোর্টে অন্য কিছু চলছে। সেটা বন্ধ করে আবার চালান।
- **সব মুছে নতুন করে শুরু**: `docker compose down -v`। ডাটাবেস আর আপলোড করা ছবি মুছে যায়; পরের `docker compose up`-এ নমুনা ডেটা আবার বসে, লগইনও আবার খুলতে হয়।
- আটকে গেলে এরর মেসেজটা Claude-কে দেখিয়ে জিজ্ঞেস করুন।

## আরও পড়ুন

- [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) — কারিগরি নির্দেশিকা (ইংরেজিতে): কাঠামো, পাতার তালিকা, ফিচার যোগের ধাপ, টেস্ট, CI
- [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) — এডমিন প্যানেল ব্যবহারের নির্দেশিকা
- [docs/README.md](docs/README.md) — সব নথির সূচি

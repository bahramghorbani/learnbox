-- 0017: Start Pack 35 review candidates (PDR-008 authorized; ADR 0016 gates preserved).
-- Inserts the 35 committed Start Pack drafts as canonical cards rows and immutable
-- version-1 card_versions rows with status needs_review, plus exactly six pending
-- content_review_checks per candidate. Deterministic identities only: every id and check
-- key below is a fixed committed uuid5 literal associated with the canonical bundled content id;
-- no random identities are used and migrations must never regenerate or rewrite these literals.
-- Repository evidence is never forged as a database-user attestation: no decision row,
-- reviewer attribution or release state is written here, and every imported check starts
-- pending so an authenticated reviewer may re-attest each dimension through the server workflow.
-- The migration is idempotent for identical existing state and fails closed on divergent
-- data: a rerun never silently updates or overwrites rows that differ from this committed
-- baseline, and it raises whenever a candidate card or version has left the baseline.
-- sourceSha256 content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json 58a2610bf7d1d9fdcfbdd47af22442a9b57e492d145960f3b5afbeb2d5926bcf
-- sourceSha256 content/packs/learnbox-start/vocabulary/start-a1-catalog-35-pending-drafts.json eec6c0e5b9963e6113ad002670f52625f326869c089e03ea1e85feb0bd00492b
-- candidates=35 checksPerCandidate=6 checks=210

-- Additive deterministic schema: records the client idempotency key of the latest check
-- mutation so an identical replay is distinguishable from a conflicting write (PDR-008).
ALTER TABLE content_review_checks
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS content_review_checks_idempotency_key_unique
  ON content_review_checks (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Candidate working set; dropped when the migration transaction ends.
CREATE TEMP TABLE _lbds049_candidates (
  content_id TEXT PRIMARY KEY,
  card_id UUID NOT NULL,
  card_lemma TEXT NOT NULL,
  version_id UUID NOT NULL,
  content_json JSONB NOT NULL,
  source_provider TEXT NOT NULL,
  source_reference TEXT
) ON COMMIT DROP;

INSERT INTO _lbds049_candidates
  (content_id, card_id, card_lemma, version_id, content_json, source_provider, source_reference)
VALUES
-- candidate start-a1-apfel card=96d7ac0c-deeb-56c2-a8b3-946b155de557 version=7a2a3507-24c5-5c4e-b619-7ecf4ec0b868
  ('start-a1-apfel', '96d7ac0c-deeb-56c2-a8b3-946b155de557', 'Apfel', '7a2a3507-24c5-5c4e-b619-7ecf4ec0b868', '{"id":"start-a1-apfel","version":1,"status":"needs_review","lemma":"Apfel","normalizedLemma":"apfel","article":"der","partOfSpeech":"noun","cefr":"A1","persianMeanings":["سیب"],"simpleGermanDefinition":"Eine runde Frucht, die man essen kann.","essentialInflection":"die Äpfel","pronunciation":{"ipa":"ˈapfəl","locale":"de-DE"},"examples":[{"german":"Der Apfel ist rot.","persian":"سیب قرمز است."}],"grammarNote":"اسم مذکر؛ جمع با تغییر واکه و -el.","topicTags":["food","shopping"],"difficulty":1,"visualConcept":"One red apple fills the visual focus; Bobo may point at it.","imagePrompt":"Soft 3D red apple, apple dominant, simple background, optional small canonical Bobo pointing, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-bahnhof card=01e8dd91-1fda-5efd-b3d0-7b37f435c49f version=88d9669c-11c4-5c81-9110-20da6506c162
  ('start-a1-bahnhof', '01e8dd91-1fda-5efd-b3d0-7b37f435c49f', 'Bahnhof', '88d9669c-11c4-5c81-9110-20da6506c162', '{"id":"start-a1-bahnhof","version":1,"status":"needs_review","lemma":"Bahnhof","normalizedLemma":"bahnhof","article":"der","partOfSpeech":"noun","cefr":"A1","persianMeanings":["ایستگاه قطار"],"simpleGermanDefinition":"Ein Ort, an dem Züge ankommen und abfahren.","essentialInflection":"die Bahnhöfe","pronunciation":{"ipa":"ˈbaːnhoːf","locale":"de-DE"},"examples":[{"german":"Der Bahnhof ist nah.","persian":"ایستگاه قطار نزدیک است."}],"grammarNote":"اسم مذکر؛ جمع با تغییر واکه و -e.","topicTags":["transport","city"],"difficulty":2,"visualConcept":"The station building and tracks carry the meaning; Bobo is a small traveler.","imagePrompt":"Soft 3D German train station exterior and tracks, environment dominant, small canonical Bobo as traveler, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-bett card=ece1459b-8d4f-5727-b33e-cfb1736fb525 version=5294257c-771f-5150-ac73-e3bb5e081e85
  ('start-a1-bett', 'ece1459b-8d4f-5727-b33e-cfb1736fb525', 'Bett', '5294257c-771f-5150-ac73-e3bb5e081e85', '{"id":"start-a1-bett","version":1,"status":"needs_review","lemma":"Bett","normalizedLemma":"bett","article":"das","partOfSpeech":"noun","cefr":"A1","persianMeanings":["تخت"],"simpleGermanDefinition":"Ein Möbelstück zum Schlafen.","essentialInflection":"die Betten","pronunciation":{"ipa":"bɛt","locale":"de-DE"},"examples":[{"german":"Das Bett ist im Zimmer.","persian":"تخت در اتاق است."}],"grammarNote":"اسم خنثی؛ جمع با -en.","topicTags":["home","household"],"difficulty":1,"visualConcept":"A bed is the dominant object in a simple room.","imagePrompt":"Soft 3D bed in a simple bedroom, bed dominant, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-brot card=d45855ca-5c3d-54f4-bf15-1f649dc55bba version=3185ae5c-11cc-5bef-a4be-5fb830cdd425
  ('start-a1-brot', 'd45855ca-5c3d-54f4-bf15-1f649dc55bba', 'Brot', '3185ae5c-11cc-5bef-a4be-5fb830cdd425', '{"id":"start-a1-brot","version":1,"status":"needs_review","lemma":"Brot","normalizedLemma":"brot","article":"das","partOfSpeech":"noun","cefr":"A1","persianMeanings":["نان"],"simpleGermanDefinition":"Ein Lebensmittel aus Mehl, Wasser und Hefe.","essentialInflection":"die Brote","pronunciation":{"ipa":"bʁoːt","locale":"de-DE"},"examples":[{"german":"Ich esse Brot.","persian":"من نان می‌خورم."}],"grammarNote":"اسم خنثی؛ جمع با -e.","topicTags":["food","daily_life"],"difficulty":1,"visualConcept":"A loaf of bread is the dominant object.","imagePrompt":"Soft 3D loaf of bread on a plain surface, bread dominant, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-danke card=a01c823f-4bb9-5949-a8b7-7fd0ded65a16 version=f3b62235-3277-5183-a6b9-89daa06a010f
  ('start-a1-danke', 'a01c823f-4bb9-5949-a8b7-7fd0ded65a16', 'danke', 'f3b62235-3277-5183-a6b9-89daa06a010f', '{"id":"start-a1-danke","version":1,"status":"needs_review","lemma":"danke","normalizedLemma":"danke","partOfSpeech":"phrase","cefr":"A1","persianMeanings":["ممنون؛ سپاسگزارم"],"simpleGermanDefinition":"Man sagt es, wenn jemand geholfen hat oder freundlich war.","essentialInflection":"ثابت","pronunciation":{"ipa":"ˈdaŋkə","locale":"de-DE"},"examples":[{"german":"Danke für deine Hilfe.","persian":"ممنون برای کمکت."}],"grammarNote":"عبارت تشکر؛ danke für با Akkusativ می‌آید.","topicTags":["politeness","daily_expression"],"difficulty":1,"visualConcept":"Bobo thanks someone with a warm gesture.","imagePrompt":"Soft 3D canonical Bobo thanking a person with a warm gesture, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-ei card=f8a9a6ef-f9cc-5e05-824a-b0cf3b8a4327 version=d375bece-375f-5144-adaf-7a95a281a8d2
  ('start-a1-ei', 'f8a9a6ef-f9cc-5e05-824a-b0cf3b8a4327', 'Ei', 'd375bece-375f-5144-adaf-7a95a281a8d2', '{"id":"start-a1-ei","version":1,"status":"needs_review","lemma":"Ei","normalizedLemma":"ei","partOfSpeech":"noun","cefr":"A1","persianMeanings":["تخم‌مرغ"],"simpleGermanDefinition":"Ein Lebensmittel vom Huhn.","essentialInflection":"die Eier","pronunciation":{"ipa":"aɪ̯","locale":"de-DE"},"examples":[{"german":"Ich esse ein Ei.","persian":"من یک تخم‌مرغ می‌خورم."}],"grammarNote":"اسم خنثی؛ جمع با تغییر واکه و پسوند -er ساخته می‌شود.","topicTags":["food","daily_life"],"difficulty":1,"visualConcept":"One egg is the clear primary object.","imagePrompt":"Soft 3D single egg on a plain surface, egg dominant, simple controlled background, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."},"article":"das"}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-entschuldigung card=fd413684-9568-5f7b-8790-092412ce8c3d version=c18ca587-f7da-5d7e-863c-44eb85440666
  ('start-a1-entschuldigung', 'fd413684-9568-5f7b-8790-092412ce8c3d', 'Entschuldigung', 'c18ca587-f7da-5d7e-863c-44eb85440666', '{"id":"start-a1-entschuldigung","version":1,"status":"needs_review","lemma":"Entschuldigung","normalizedLemma":"entschuldigung","partOfSpeech":"phrase","cefr":"A1","persianMeanings":["ببخشید؛ معذرت می‌خواهم"],"simpleGermanDefinition":"Man sagt es, wenn man höflich um Aufmerksamkeit bittet oder sich entschuldigt.","essentialInflection":"ثابت","pronunciation":{"ipa":"ɛntˈʃʊldɪɡʊŋ","locale":"de-DE"},"examples":[{"german":"Entschuldigung, wo ist der Bahnhof?","persian":"ببخشید، ایستگاه قطار کجاست؟"}],"grammarNote":"برای عذرخواهی یا شروع پرسش مؤدبانه به‌کار می‌رود.","topicTags":["politeness","daily_expression"],"difficulty":1,"visualConcept":"Bobo politely asks a passerby for attention; no written signs.","imagePrompt":"Soft 3D canonical Bobo politely asking a passerby for attention, clear gesture, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-essen card=d88a1e83-0498-5298-8788-b945a1ebd3c7 version=45a18ad7-7cae-52b5-a073-955e7a844d30
  ('start-a1-essen', 'd88a1e83-0498-5298-8788-b945a1ebd3c7', 'essen', '45a18ad7-7cae-52b5-a073-955e7a844d30', '{"id":"start-a1-essen","version":1,"status":"needs_review","lemma":"essen","normalizedLemma":"essen","partOfSpeech":"verb","cefr":"A1","persianMeanings":["خوردن"],"simpleGermanDefinition":"Etwas als Nahrung zu sich nehmen.","essentialInflection":"isst, aß, hat gegessen","pronunciation":{"ipa":"ˈɛsn̩","locale":"de-DE"},"examples":[{"german":"Ich esse zu Mittag.","persian":"من ناهار می‌خورم."}],"grammarNote":"فعل بی‌قاعده؛ ریشه در حالت دوم شخص مفرد تغییر می‌کند.","topicTags":["food","core_verb"],"difficulty":1,"visualConcept":"Bobo eats at a simple table and is the clear action subject.","imagePrompt":"Soft 3D canonical Bobo eating at a simple table, action clear, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-fenster card=da0fd3c1-8603-5aae-89b2-5c0e25803887 version=a9e83512-0a20-5de6-bac6-bfbed1f81311
  ('start-a1-fenster', 'da0fd3c1-8603-5aae-89b2-5c0e25803887', 'Fenster', 'a9e83512-0a20-5de6-bac6-bfbed1f81311', '{"id":"start-a1-fenster","version":1,"status":"needs_review","lemma":"Fenster","normalizedLemma":"fenster","partOfSpeech":"noun","cefr":"A1","persianMeanings":["پنجره"],"simpleGermanDefinition":"Ein Teil der Wand, den man öffnen kann.","essentialInflection":"die Fenster","pronunciation":{"ipa":"ˈfɛnstɐ","locale":"de-DE"},"examples":[{"german":"Das Fenster ist offen.","persian":"پنجره باز است."}],"grammarNote":"اسم خنثی؛ جمع بدون تغییر است.","topicTags":["home","household"],"difficulty":1,"visualConcept":"An open window in a simple wall is the clear primary object.","imagePrompt":"Soft 3D open window in a simple room wall, window dominant, simple controlled background, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."},"article":"das"}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-gehen card=41310fab-770a-5af1-8bcb-49f4d962dd7f version=4002312c-b459-5288-9cd6-5431f59f3e10
  ('start-a1-gehen', '41310fab-770a-5af1-8bcb-49f4d962dd7f', 'gehen', '4002312c-b459-5288-9cd6-5431f59f3e10', '{"id":"start-a1-gehen","version":1,"status":"needs_review","lemma":"gehen","normalizedLemma":"gehen","partOfSpeech":"verb","cefr":"A1","persianMeanings":["رفتن"],"simpleGermanDefinition":"Sich zu Fuß von einem Ort zu einem anderen bewegen.","essentialInflection":"geht, ging, ist gegangen","pronunciation":{"ipa":"ˈɡeːən","locale":"de-DE"},"examples":[{"german":"Ich gehe zur Schule.","persian":"من به مدرسه می‌روم."}],"grammarNote":"فعل بی‌قاعده؛ با فعل کمکی sein صرف می‌شود.","topicTags":["transport","core_verb"],"difficulty":1,"visualConcept":"Bobo walks along a street and is the clear action subject.","imagePrompt":"Soft 3D canonical Bobo walking along a simple street, action clear, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-gluecklich card=f1f2bb3e-bef3-539f-ba4b-5225b4baa5d5 version=d991a817-01d7-5a79-9c37-ead7627bd905
  ('start-a1-gluecklich', 'f1f2bb3e-bef3-539f-ba4b-5225b4baa5d5', 'glücklich', 'd991a817-01d7-5a79-9c37-ead7627bd905', '{"id":"start-a1-gluecklich","version":1,"status":"needs_review","lemma":"glücklich","normalizedLemma":"glücklich","partOfSpeech":"adjective","cefr":"A1","persianMeanings":["خوشحال"],"simpleGermanDefinition":"Man fühlt sich sehr gut und zufrieden.","essentialInflection":"nicht flektiert im Lernhinweis","pronunciation":{"ipa":"ˈɡlʏklɪç","locale":"de-DE"},"examples":[{"german":"Ich bin glücklich.","persian":"من خوشحالم."}],"grammarNote":"صفت؛ بعد از sein بدون پسوند می‌آید.","topicTags":["emotion","adjective"],"difficulty":1,"visualConcept":"A clearly happy Bobo is the primary subject.","imagePrompt":"Soft 3D canonical Bobo visibly happy, clear joyful expression, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-gross card=e3421ee9-03bc-5757-8b34-dbbebe95b759 version=0791ec0f-fb23-5aef-86f8-78297cf4e232
  ('start-a1-gross', 'e3421ee9-03bc-5757-8b34-dbbebe95b759', 'groß', '0791ec0f-fb23-5aef-86f8-78297cf4e232', '{"id":"start-a1-gross","version":1,"status":"needs_review","lemma":"groß","normalizedLemma":"groß","partOfSpeech":"adjective","cefr":"A1","persianMeanings":["بزرگ"],"simpleGermanDefinition":"Von großer Größe; nicht klein.","essentialInflection":"groß, größer, am größten","pronunciation":{"ipa":"ɡʁoːs","locale":"de-DE"},"examples":[{"german":"Der Elefant ist groß.","persian":"فیل بزرگ است."}],"grammarNote":"صفت؛ در جایگاه خبری بعد از sein بدون پسوند می‌آید.","topicTags":["adjective","description"],"difficulty":1,"visualConcept":"A large house beside a much smaller tree gives a single clear comparison.","imagePrompt":"Soft 3D large house beside a smaller tree, size relationship clear, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-guten-tag card=43d6699d-c94b-5daf-b86e-3667c591bc9f version=87e28118-ec3a-5e7d-932e-8b15b696fdfb
  ('start-a1-guten-tag', '43d6699d-c94b-5daf-b86e-3667c591bc9f', 'Guten Tag', '87e28118-ec3a-5e7d-932e-8b15b696fdfb', '{"id":"start-a1-guten-tag","version":1,"status":"needs_review","lemma":"Guten Tag","normalizedLemma":"guten tag","partOfSpeech":"phrase","cefr":"A1","persianMeanings":["روز بخیر؛ سلام"],"simpleGermanDefinition":"Eine höfliche Begrüßung am Tag.","essentialInflection":"ثابت","pronunciation":{"ipa":"ˈɡuːtn̩ taːk","locale":"de-DE"},"examples":[{"german":"Guten Tag, Frau Müller.","persian":"روز بخیر، خانم مولر."}],"grammarNote":"عبارت سلام رسمی؛ معمولاً با حرف بزرگ شروع می‌شود.","topicTags":["greeting","daily_expression"],"difficulty":1,"visualConcept":"Two people greet each other; no written words in the image.","imagePrompt":"Soft 3D polite daytime greeting between canonical Bobo and a person, gesture clear, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-haus card=a5481ff8-e315-5f58-afdb-4de9e4628939 version=b89dabb1-406a-5b88-b535-4e90ba6af24c
  ('start-a1-haus', 'a5481ff8-e315-5f58-afdb-4de9e4628939', 'Haus', 'b89dabb1-406a-5b88-b535-4e90ba6af24c', '{"id":"start-a1-haus","version":1,"status":"needs_review","lemma":"Haus","normalizedLemma":"haus","article":"das","partOfSpeech":"noun","cefr":"A1","persianMeanings":["خانه"],"simpleGermanDefinition":"Ein Gebäude, in dem Menschen wohnen.","essentialInflection":"die Häuser","pronunciation":{"ipa":"haʊs","locale":"de-DE"},"examples":[{"german":"Das Haus ist klein.","persian":"خانه کوچک است."}],"grammarNote":"اسم خنثی؛ جمع با تغییر واکه ساخته می‌شود.","topicTags":["home","household"],"difficulty":1,"visualConcept":"A small house is the clear primary object; Bobo may stand near the door.","imagePrompt":"Soft 3D small house, house dominant, clean background, small canonical Bobo near the door, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-kaffee card=95a161b4-b268-54a0-8c52-6ff765d27294 version=e16831c4-74a0-5f21-8edd-35c89c7202de
  ('start-a1-kaffee', '95a161b4-b268-54a0-8c52-6ff765d27294', 'Kaffee', 'e16831c4-74a0-5f21-8edd-35c89c7202de', '{"id":"start-a1-kaffee","version":1,"status":"needs_review","lemma":"Kaffee","normalizedLemma":"kaffee","partOfSpeech":"noun","cefr":"A1","persianMeanings":["قهوه"],"simpleGermanDefinition":"Ein heißes Getränk, das viele Menschen am Morgen trinken.","essentialInflection":"kein Plural im üblichen Gebrauch","pronunciation":{"ipa":"ˈkafeː","locale":"de-DE"},"examples":[{"german":"Der Kaffee ist heiß.","persian":"قهوه داغ است."}],"grammarNote":"اسم مذکر؛ معمولاً غیرقابل‌شمارش است.","topicTags":["food","daily_life"],"difficulty":1,"visualConcept":"A cup of coffee is the dominant object; steam makes it readable.","imagePrompt":"Soft 3D cup of hot coffee with light steam, cup dominant, simple controlled background, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."},"article":"der"}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-kalt card=fbf78cb5-b7f1-57f6-9da6-45c699b52cbe version=bf413db8-fd36-5368-8baf-432f6e7198a8
  ('start-a1-kalt', 'fbf78cb5-b7f1-57f6-9da6-45c699b52cbe', 'kalt', 'bf413db8-fd36-5368-8baf-432f6e7198a8', '{"id":"start-a1-kalt","version":1,"status":"needs_review","lemma":"kalt","normalizedLemma":"kalt","partOfSpeech":"adjective","cefr":"A1","persianMeanings":["سرد"],"simpleGermanDefinition":"Mit niedriger Temperatur; nicht warm.","essentialInflection":"kalt, kälter, am kältesten","pronunciation":{"ipa":"kalt","locale":"de-DE"},"examples":[{"german":"Im Winter ist es kalt.","persian":"در زمستان هوا سرد است."}],"grammarNote":"صفت؛ در جایگاه خبری بعد از sein بدون پسوند می‌آید.","topicTags":["adjective","description"],"difficulty":1,"visualConcept":"A winter window scene with frost makes the cold concept unmistakable.","imagePrompt":"Soft 3D frosted winter window scene, cold feeling clear, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-kaufen card=61e24df6-1b56-5084-9fb7-9dd622423f07 version=5731d22f-c33c-54f8-aa2b-0528c4f600cc
  ('start-a1-kaufen', '61e24df6-1b56-5084-9fb7-9dd622423f07', 'kaufen', '5731d22f-c33c-54f8-aa2b-0528c4f600cc', '{"id":"start-a1-kaufen","version":1,"status":"needs_review","lemma":"kaufen","normalizedLemma":"kaufen","partOfSpeech":"verb","cefr":"A1","persianMeanings":["خریدن"],"simpleGermanDefinition":"Etwas gegen Geld bekommen.","essentialInflection":"kauft, kaufte, hat gekauft","pronunciation":{"ipa":"ˈkaʊfn̩","locale":"de-DE"},"examples":[{"german":"Ich kaufe Brot.","persian":"من نان می‌خرم."}],"grammarNote":"فعل باقاعده؛ مفعول مستقیم معمولاً در حالت Akkusativ می‌آید.","topicTags":["shopping","core_verb"],"difficulty":1,"visualConcept":"Bobo buys bread at a simple shop counter.","imagePrompt":"Soft 3D canonical Bobo buying bread at a simple shop counter, action clear, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-klein card=9e5e9bc8-1d6f-579e-b87f-fef547c4dcb4 version=d3b38959-f7da-57df-afee-3be1e6e6167e
  ('start-a1-klein', '9e5e9bc8-1d6f-579e-b87f-fef547c4dcb4', 'klein', 'd3b38959-f7da-57df-afee-3be1e6e6167e', '{"id":"start-a1-klein","version":1,"status":"needs_review","lemma":"klein","normalizedLemma":"klein","partOfSpeech":"adjective","cefr":"A1","persianMeanings":["کوچک"],"simpleGermanDefinition":"Nicht groß.","essentialInflection":"klein, kleiner, am kleinsten","pronunciation":{"ipa":"klaɪn","locale":"de-DE"},"examples":[{"german":"Das Haus ist klein.","persian":"خانه کوچک است."}],"grammarNote":"صفت؛ در جایگاه خبری بعد از sein بدون پسوند می‌آید.","topicTags":["adjective","description"],"difficulty":1,"visualConcept":"A small house beside a much larger tree gives a single clear comparison.","imagePrompt":"Soft 3D small house beside a larger tree, size relationship clear, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-lernen card=3caa82c3-ba3c-593f-9c7f-ba54bc483e6f version=133b1a95-4fac-54ec-a0e0-40d380222685
  ('start-a1-lernen', '3caa82c3-ba3c-593f-9c7f-ba54bc483e6f', 'lernen', '133b1a95-4fac-54ec-a0e0-40d380222685', '{"id":"start-a1-lernen","version":1,"status":"needs_review","lemma":"lernen","normalizedLemma":"lernen","partOfSpeech":"verb","cefr":"A1","persianMeanings":["یاد گرفتن"],"simpleGermanDefinition":"Etwas Neues verstehen und üben.","essentialInflection":"lernt, lernte, hat gelernt","pronunciation":{"ipa":"ˈlɛʁnən","locale":"de-DE"},"examples":[{"german":"Ich lerne Deutsch.","persian":"من آلمانی یاد می‌گیرم."}],"grammarNote":"فعل باقاعده؛ در جملهٔ خبری معمولاً جایگاه دوم می‌آید.","topicTags":["education","core_verb"],"difficulty":1,"visualConcept":"Bobo studies with a book and is the clear action subject.","imagePrompt":"Soft 3D canonical Bobo studying with an open book, action clear, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-milch card=97edb3cf-ae1b-5226-bdc7-ad0b22fae037 version=4ba8588f-847a-5ba7-923c-d79c23724c6e
  ('start-a1-milch', '97edb3cf-ae1b-5226-bdc7-ad0b22fae037', 'Milch', '4ba8588f-847a-5ba7-923c-d79c23724c6e', '{"id":"start-a1-milch","version":1,"status":"needs_review","lemma":"Milch","normalizedLemma":"milch","partOfSpeech":"noun","cefr":"A1","persianMeanings":["شیر"],"simpleGermanDefinition":"Ein weißes Getränk, das von der Kuh kommt.","essentialInflection":"kein Plural im üblichen Gebrauch","pronunciation":{"ipa":"mɪlç","locale":"de-DE"},"examples":[{"german":"Ich trinke Milch.","persian":"من شیر می‌نوشم."}],"grammarNote":"اسم مؤنث؛ معمولاً غیرقابل‌شمارش است.","topicTags":["food","daily_life"],"difficulty":1,"visualConcept":"A glass of milk is the clear primary object.","imagePrompt":"Soft 3D glass of milk, glass dominant, simple controlled background, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."},"article":"die"}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-muede card=c5f07af9-75cf-5a24-9e7b-6f3ae93ada6e version=3a281142-13e8-5fc2-82e1-bf6c1da9c95e
  ('start-a1-muede', 'c5f07af9-75cf-5a24-9e7b-6f3ae93ada6e', 'müde', '3a281142-13e8-5fc2-82e1-bf6c1da9c95e', '{"id":"start-a1-muede","version":1,"status":"needs_review","lemma":"müde","normalizedLemma":"müde","partOfSpeech":"adjective","cefr":"A1","persianMeanings":["خسته"],"simpleGermanDefinition":"Man braucht Schlaf oder Ruhe.","essentialInflection":"nicht flektiert im Lernhinweis","pronunciation":{"ipa":"ˈmyːdə","locale":"de-DE"},"examples":[{"german":"Ich bin müde.","persian":"من خسته‌ام."}],"grammarNote":"صفت؛ بعد از sein بدون پسوند می‌آید.","topicTags":["emotion","adjective"],"difficulty":1,"visualConcept":"A sleepy Bobo and a simple bedside lamp clarify the state.","imagePrompt":"Soft 3D canonical Bobo visibly sleepy beside a simple lamp, state clear, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-neu card=200ea136-cb57-5d85-8900-dc0db66eea2d version=87faf69e-812a-5f24-8b27-f7c7a6cc02f1
  ('start-a1-neu', '200ea136-cb57-5d85-8900-dc0db66eea2d', 'neu', '87faf69e-812a-5f24-8b27-f7c7a6cc02f1', '{"id":"start-a1-neu","version":1,"status":"needs_review","lemma":"neu","normalizedLemma":"neu","partOfSpeech":"adjective","cefr":"A1","persianMeanings":["جدید"],"simpleGermanDefinition":"Noch nicht lange da; nicht alt.","essentialInflection":"neu, neuer, am neuesten","pronunciation":{"ipa":"nɔʏ","locale":"de-DE"},"examples":[{"german":"Das Auto ist neu.","persian":"ماشین نو است."}],"grammarNote":"صفت؛ در جایگاه خبری بعد از sein بدون پسوند می‌آید.","topicTags":["adjective","description"],"difficulty":1,"visualConcept":"A shiny new bicycle beside an old worn one gives a single clear comparison.","imagePrompt":"Soft 3D new shiny bicycle beside an old worn bicycle, contrast clear, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-schule card=5028e37c-d4a5-5f83-b889-d43b7f33dbfd version=63a0abc9-a779-505d-aeaa-f120f7f9dedd
  ('start-a1-schule', '5028e37c-d4a5-5f83-b889-d43b7f33dbfd', 'Schule', '63a0abc9-a779-505d-aeaa-f120f7f9dedd', '{"id":"start-a1-schule","version":1,"status":"needs_review","lemma":"Schule","normalizedLemma":"schule","article":"die","partOfSpeech":"noun","cefr":"A1","persianMeanings":["مدرسه"],"simpleGermanDefinition":"Ein Ort, an dem Kinder und Jugendliche lernen.","essentialInflection":"die Schulen","pronunciation":{"ipa":"ˈʃuːlə","locale":"de-DE"},"examples":[{"german":"Die Schule ist heute offen.","persian":"مدرسه امروز باز است."}],"grammarNote":"اسم مؤنث؛ جمع با -n.","topicTags":["education","place"],"difficulty":1,"visualConcept":"A school building is the main subject; Bobo may be a small student.","imagePrompt":"Soft 3D school building, environment dominant, small canonical Bobo as student, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-stadt card=8e988a52-fd16-504c-8419-7ea619369797 version=f1b80cb8-a114-54e5-9405-381a72eafbc3
  ('start-a1-stadt', '8e988a52-fd16-504c-8419-7ea619369797', 'Stadt', 'f1b80cb8-a114-54e5-9405-381a72eafbc3', '{"id":"start-a1-stadt","version":1,"status":"needs_review","lemma":"Stadt","normalizedLemma":"stadt","partOfSpeech":"noun","cefr":"A1","persianMeanings":["شهر"],"simpleGermanDefinition":"Ein großer Ort, in dem viele Menschen wohnen.","essentialInflection":"die Städte","pronunciation":{"ipa":"ʃtat","locale":"de-DE"},"examples":[{"german":"Die Stadt ist groß.","persian":"شهر بزرگ است."}],"grammarNote":"اسم مؤنث؛ جمع با تغییر واکه ساخته می‌شود.","topicTags":["place","city"],"difficulty":1,"visualConcept":"A small city skyline carries the meaning; Bobo may be a small pedestrian.","imagePrompt":"Soft 3D small city skyline, environment dominant, optional small canonical Bobo as pedestrian, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."},"article":"die"}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-supermarkt card=fb5ea301-aa46-5152-a009-2aa6a7240958 version=4062945b-6048-59bb-b00f-46a1fd74344c
  ('start-a1-supermarkt', 'fb5ea301-aa46-5152-a009-2aa6a7240958', 'Supermarkt', '4062945b-6048-59bb-b00f-46a1fd74344c', '{"id":"start-a1-supermarkt","version":1,"status":"needs_review","lemma":"Supermarkt","normalizedLemma":"supermarkt","partOfSpeech":"noun","cefr":"A1","persianMeanings":["سوپرمارکت"],"simpleGermanDefinition":"Ein großes Geschäft, in dem man Lebensmittel kauft.","essentialInflection":"die Supermärkte","pronunciation":{"ipa":"ˈzuːpɐmaʁkt","locale":"de-DE"},"examples":[{"german":"Ich kaufe im Supermarkt ein.","persian":"من از سوپرمارکت خرید می‌کنم."}],"grammarNote":"اسم مذکر؛ جمع با تغییر واکه ساخته می‌شود.","topicTags":["shopping","place"],"difficulty":2,"visualConcept":"A supermarket interior with shelves carries the meaning; Bobo shops with a basket.","imagePrompt":"Soft 3D supermarket interior with shelves, environment dominant, small canonical Bobo with a basket, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."},"article":"der"}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-tee card=59f191b7-9f8e-558f-8a4c-de97eaf63e88 version=09666628-fae5-5e7a-b7de-0f27147f879d
  ('start-a1-tee', '59f191b7-9f8e-558f-8a4c-de97eaf63e88', 'Tee', '09666628-fae5-5e7a-b7de-0f27147f879d', '{"id":"start-a1-tee","version":1,"status":"needs_review","lemma":"Tee","normalizedLemma":"tee","partOfSpeech":"noun","cefr":"A1","persianMeanings":["چای"],"simpleGermanDefinition":"Ein heißes Getränk aus Blättern.","essentialInflection":"die Tees","pronunciation":{"ipa":"teː","locale":"de-DE"},"examples":[{"german":"Der Tee ist heiß.","persian":"چای داغ است."}],"grammarNote":"اسم مذکر؛ جمع با پسوند -s ساخته می‌شود.","topicTags":["food","daily_life"],"difficulty":1,"visualConcept":"A cup of tea with a tea bag is the dominant object.","imagePrompt":"Soft 3D cup of tea, cup dominant, simple controlled background, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."},"article":"der"}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-tisch card=a477921f-a102-5b84-9f56-d243f432e36e version=098b7e0a-7c14-55ec-815a-118327a50619
  ('start-a1-tisch', 'a477921f-a102-5b84-9f56-d243f432e36e', 'Tisch', '098b7e0a-7c14-55ec-815a-118327a50619', '{"id":"start-a1-tisch","version":1,"status":"needs_review","lemma":"Tisch","normalizedLemma":"tisch","article":"der","partOfSpeech":"noun","cefr":"A1","persianMeanings":["میز"],"simpleGermanDefinition":"Ein Möbelstück mit einer flachen Fläche.","essentialInflection":"die Tische","pronunciation":{"ipa":"tɪʃ","locale":"de-DE"},"examples":[{"german":"Der Tisch ist groß.","persian":"میز بزرگ است."}],"grammarNote":"اسم مذکر؛ جمع با -e.","topicTags":["home","household"],"difficulty":1,"visualConcept":"A table is the only dominant object; no Bobo needed.","imagePrompt":"Soft 3D wooden table, object dominant, simple controlled background, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-trinken card=e6740f47-717f-519e-9e83-9d915ba8829a version=6755b440-257d-5389-99c0-554c3178d9b7
  ('start-a1-trinken', 'e6740f47-717f-519e-9e83-9d915ba8829a', 'trinken', '6755b440-257d-5389-99c0-554c3178d9b7', '{"id":"start-a1-trinken","version":1,"status":"needs_review","lemma":"trinken","normalizedLemma":"trinken","partOfSpeech":"verb","cefr":"A1","persianMeanings":["نوشیدن"],"simpleGermanDefinition":"Eine Flüssigkeit zu sich nehmen.","essentialInflection":"trinkt, trank, hat getrunken","pronunciation":{"ipa":"ˈtʁɪŋkn̩","locale":"de-DE"},"examples":[{"german":"Ich trinke Wasser.","persian":"من آب می‌نوشم."}],"grammarNote":"فعل بی‌قاعده؛ زمان گذشته و ماضی نقلی تغییر واکه دارند.","topicTags":["food","core_verb"],"difficulty":1,"visualConcept":"Bobo drinks a glass of water and is the clear action subject.","imagePrompt":"Soft 3D canonical Bobo drinking from a glass of water, action clear, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-tuer card=cb9f38e5-afeb-5e86-92fd-9e5a1e866dbf version=033ab6b0-b799-50ac-a7f6-5e13437f0048
  ('start-a1-tuer', 'cb9f38e5-afeb-5e86-92fd-9e5a1e866dbf', 'Tür', '033ab6b0-b799-50ac-a7f6-5e13437f0048', '{"id":"start-a1-tuer","version":1,"status":"needs_review","lemma":"Tür","normalizedLemma":"tür","article":"die","partOfSpeech":"noun","cefr":"A1","persianMeanings":["در"],"simpleGermanDefinition":"Man öffnet und schließt sie, um in einen Raum zu gehen.","essentialInflection":"die Türen","pronunciation":{"ipa":"tyːɐ̯","locale":"de-DE"},"examples":[{"german":"Die Tür ist offen.","persian":"در باز است."}],"grammarNote":"اسم مؤنث؛ جمع با -en.","topicTags":["home","household"],"difficulty":1,"visualConcept":"An open door clearly shows the concept; Bobo can be small beside it.","imagePrompt":"Soft 3D open apartment door, door dominant, small canonical Bobo beside it, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-uhr card=304724b3-2d0c-5f2e-a3e9-a929bbee9c10 version=0a4007f5-55f0-5770-ab37-1c3e4f3cd9ee
  ('start-a1-uhr', '304724b3-2d0c-5f2e-a3e9-a929bbee9c10', 'Uhr', '0a4007f5-55f0-5770-ab37-1c3e4f3cd9ee', '{"id":"start-a1-uhr","version":1,"status":"needs_review","lemma":"Uhr","normalizedLemma":"uhr","partOfSpeech":"noun","cefr":"A1","persianMeanings":["ساعت"],"simpleGermanDefinition":"Ein Gerät, das die Zeit zeigt.","essentialInflection":"die Uhren","pronunciation":{"ipa":"uːɐ̯","locale":"de-DE"},"examples":[{"german":"Die Uhr ist neu.","persian":"ساعت نو است."}],"grammarNote":"اسم مؤنث؛ جمع با پسوند -en ساخته می‌شود.","topicTags":["time","daily_life"],"difficulty":1,"visualConcept":"A wall clock is the only dominant object; the time concept is unambiguous.","imagePrompt":"Soft 3D wall clock, clock dominant, simple controlled background, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."},"article":"die"}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-warten card=0a0a885f-940d-5687-b2de-08776d2317dd version=c8ad02f8-7deb-5ad6-88f0-ec6085e2607d
  ('start-a1-warten', '0a0a885f-940d-5687-b2de-08776d2317dd', 'warten', 'c8ad02f8-7deb-5ad6-88f0-ec6085e2607d', '{"id":"start-a1-warten","version":1,"status":"needs_review","lemma":"warten","normalizedLemma":"warten","partOfSpeech":"verb","cefr":"A1","persianMeanings":["منتظر ماندن"],"simpleGermanDefinition":"Bleiben, bis etwas oder jemand kommt.","essentialInflection":"wartet, wartete, hat gewartet","pronunciation":{"ipa":"ˈvaʁtn̩","locale":"de-DE"},"examples":[{"german":"Ich warte auf den Bus.","persian":"من منتظر اتوبوس هستم."}],"grammarNote":"اغلب با auf + Akkusativ به‌کار می‌رود.","topicTags":["transport","core_verb"],"difficulty":2,"visualConcept":"Bobo waits at a bus stop; the waiting action is unmistakable.","imagePrompt":"Soft 3D canonical Bobo waiting at a bus stop, action clear, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-wasser card=1bb18839-5b93-5a16-a8bd-f8cafa54ebc5 version=34c6589a-76a3-572a-8bbd-43698d022d0d
  ('start-a1-wasser', '1bb18839-5b93-5a16-a8bd-f8cafa54ebc5', 'Wasser', '34c6589a-76a3-572a-8bbd-43698d022d0d', '{"id":"start-a1-wasser","version":1,"status":"needs_review","lemma":"Wasser","normalizedLemma":"wasser","article":"das","partOfSpeech":"noun","cefr":"A1","persianMeanings":["آب"],"simpleGermanDefinition":"Eine klare Flüssigkeit zum Trinken.","essentialInflection":"kein Plural im üblichen Gebrauch","pronunciation":{"ipa":"ˈvasɐ","locale":"de-DE"},"examples":[{"german":"Das Wasser ist kalt.","persian":"آب سرد است."}],"grammarNote":"اسم خنثی؛ معمولاً غیرقابل‌شمارش است.","topicTags":["food","daily_life"],"difficulty":1,"visualConcept":"A clear glass of water is the dominant object.","imagePrompt":"Soft 3D clear glass of water, glass dominant, simple controlled background, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-wie-geht-es-ihnen card=77fe44c5-7337-5485-a39e-130ae53be27d version=d465a939-bad0-5cf4-bd69-128c1b577299
  ('start-a1-wie-geht-es-ihnen', '77fe44c5-7337-5485-a39e-130ae53be27d', 'Wie geht es Ihnen?', 'd465a939-bad0-5cf4-bd69-128c1b577299', '{"id":"start-a1-wie-geht-es-ihnen","version":1,"status":"needs_review","lemma":"Wie geht es Ihnen?","normalizedLemma":"wie geht es ihnen?","partOfSpeech":"phrase","cefr":"A1","persianMeanings":["حال شما چطور است؟"],"simpleGermanDefinition":"Eine höfliche Frage nach dem Befinden.","essentialInflection":"ثابت","pronunciation":{"ipa":"viː ɡeːt ɛs ˈiːnən","locale":"de-DE"},"examples":[{"german":"Guten Tag. Wie geht es Ihnen?","persian":"روز بخیر. حال شما چطور است؟"}],"grammarNote":"عبارت رسمی؛ Ihnen با حرف بزرگ نوشته می‌شود.","topicTags":["greeting","daily_expression"],"difficulty":2,"visualConcept":"A polite Bobo asks a person how they are; conversational gesture only.","imagePrompt":"Soft 3D canonical Bobo politely greeting a person, conversational gesture clear, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-wohnen card=8064312c-fe2a-5067-aaf8-e079774c0838 version=1171bf4f-9238-55fd-ba58-fd7b13d57e2e
  ('start-a1-wohnen', '8064312c-fe2a-5067-aaf8-e079774c0838', 'wohnen', '1171bf4f-9238-55fd-ba58-fd7b13d57e2e', '{"id":"start-a1-wohnen","version":1,"status":"needs_review","lemma":"wohnen","normalizedLemma":"wohnen","partOfSpeech":"verb","cefr":"A1","persianMeanings":["زندگی کردن؛ ساکن بودن"],"simpleGermanDefinition":"An einem Ort sein Zuhause haben.","essentialInflection":"wohnt, wohnte, hat gewohnt","pronunciation":{"ipa":"ˈvoːnən","locale":"de-DE"},"examples":[{"german":"Ich wohne in Berlin.","persian":"من در برلین زندگی می‌کنم."}],"grammarNote":"فعل باقاعده؛ برای گفتن محل زندگی معمولاً با in می‌آید.","topicTags":["home","core_verb"],"difficulty":1,"visualConcept":"Bobo is comfortably at home in a simple room.","imagePrompt":"Soft 3D canonical Bobo at home in a simple room, action and home context clear, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."}}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'),
-- candidate start-a1-zimmer card=0fe08b1a-f485-5076-8ef1-88acf0d4b945 version=1d517abe-97d7-539c-b2d2-93ccccbf97c4
  ('start-a1-zimmer', '0fe08b1a-f485-5076-8ef1-88acf0d4b945', 'Zimmer', '1d517abe-97d7-539c-b2d2-93ccccbf97c4', '{"id":"start-a1-zimmer","version":1,"status":"needs_review","lemma":"Zimmer","normalizedLemma":"zimmer","partOfSpeech":"noun","cefr":"A1","persianMeanings":["اتاق"],"simpleGermanDefinition":"Ein Raum in einer Wohnung oder in einem Haus.","essentialInflection":"die Zimmer","pronunciation":{"ipa":"ˈtsɪmɐ","locale":"de-DE"},"examples":[{"german":"Das Zimmer ist groß.","persian":"اتاق بزرگ است."}],"grammarNote":"اسم خنثی؛ جمع بدون تغییر است.","topicTags":["home","household"],"difficulty":1,"visualConcept":"A simple furnished room is the dominant scene; no Bobo needed.","imagePrompt":"Soft 3D simple furnished room, room dominant, clean controlled background, no text or watermark.","media":[],"source":{"provider":"ai_suggestion","reference":"Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending."},"provenance":{"sourceType":"ai_assisted","sourceReference":"Goethe A1 scope reference; German and Persian review pending."},"article":"das"}'::jsonb, 'ai_suggestion', 'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.');

-- Fail-closed guards: any divergent existing row for a committed candidate aborts the
-- migration instead of being silently updated or overwritten.
DO $$
DECLARE
  candidate RECORD;
BEGIN
  FOR candidate IN SELECT * FROM _lbds049_candidates ORDER BY content_id LOOP
    IF EXISTS (
      SELECT 1
        FROM cards c
       WHERE c.content_id = candidate.content_id
         AND (c.id IS DISTINCT FROM candidate.card_id
              OR c.lemma IS DISTINCT FROM candidate.card_lemma
              OR c.content_version IS DISTINCT FROM 1)
    ) THEN
      RAISE EXCEPTION '0017 fail-closed: cards row for % diverges from committed Start Pack baseline', candidate.content_id;
    END IF;
    IF EXISTS (
      SELECT 1
        FROM card_versions cv
        JOIN cards c ON c.id = cv.card_id
       WHERE c.content_id = candidate.content_id
         AND (cv.id IS DISTINCT FROM candidate.version_id
              OR cv.version IS DISTINCT FROM 1
              OR cv.status IS DISTINCT FROM 'needs_review'
              OR cv.source_provider IS DISTINCT FROM candidate.source_provider
              OR cv.source_reference IS DISTINCT FROM candidate.source_reference
              OR cv.content_json IS DISTINCT FROM candidate.content_json)
    ) THEN
      RAISE EXCEPTION '0017 fail-closed: card_versions row for % diverges from committed needs_review baseline', candidate.content_id;
    END IF;
  END LOOP;
END $$;

INSERT INTO cards (id, content_id, lemma, content_version)
SELECT card_id, content_id, card_lemma, 1
  FROM _lbds049_candidates
 WHERE NOT EXISTS (SELECT 1 FROM cards c WHERE c.content_id = _lbds049_candidates.content_id);

INSERT INTO card_versions (id, card_id, version, status, content_json, source_provider, source_reference)
SELECT version_id, card_id, 1, 'needs_review', content_json, source_provider, source_reference
  FROM _lbds049_candidates
 WHERE NOT EXISTS (SELECT 1 FROM card_versions cv WHERE cv.card_id = _lbds049_candidates.card_id AND cv.version = 1);

-- Six pending checks per candidate with fixed identities (check id + check key).
CREATE TEMP TABLE _lbds049_checks (
  content_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  check_id UUID NOT NULL,
  check_key UUID NOT NULL
) ON COMMIT DROP;

INSERT INTO _lbds049_checks (content_id, dimension, check_id, check_key)
VALUES
-- check start-a1-apfel german_linguistic id=2e3d974c-8f10-5041-b95d-e6d847c08667 idem=60cee7d7-ad00-5e69-b20f-cd623ff602a1
  ('start-a1-apfel', 'german_linguistic', '2e3d974c-8f10-5041-b95d-e6d847c08667', '60cee7d7-ad00-5e69-b20f-cd623ff602a1'),
-- check start-a1-apfel persian_translation id=00a0833a-7a6a-5964-b9b3-20ea77666ab1 idem=29f435ab-84b1-5dd7-b2d0-88f485c604f4
  ('start-a1-apfel', 'persian_translation', '00a0833a-7a6a-5964-b9b3-20ea77666ab1', '29f435ab-84b1-5dd7-b2d0-88f485c604f4'),
-- check start-a1-apfel provenance id=0d4de903-3a46-54a1-a665-15158c04f303 idem=ddbb86f6-a0f9-54a4-9c0d-d3a01479b093
  ('start-a1-apfel', 'provenance', '0d4de903-3a46-54a1-a665-15158c04f303', 'ddbb86f6-a0f9-54a4-9c0d-d3a01479b093'),
-- check start-a1-apfel visual id=f05e2f90-80e0-53c2-add5-cead7ea772fe idem=68a30a04-a576-582e-bc25-8f19366131c6
  ('start-a1-apfel', 'visual', 'f05e2f90-80e0-53c2-add5-cead7ea772fe', '68a30a04-a576-582e-bc25-8f19366131c6'),
-- check start-a1-apfel audio id=e4db196a-6e2e-5ffc-9b3b-837dfefab2f3 idem=7beee3f4-87d2-5738-bbd5-1e61cef6f49c
  ('start-a1-apfel', 'audio', 'e4db196a-6e2e-5ffc-9b3b-837dfefab2f3', '7beee3f4-87d2-5738-bbd5-1e61cef6f49c'),
-- check start-a1-apfel app_flow id=4128aa8f-3e41-534e-80ca-1b5545dc486f idem=086e850e-95f9-5b71-8f28-7ecf81ed973d
  ('start-a1-apfel', 'app_flow', '4128aa8f-3e41-534e-80ca-1b5545dc486f', '086e850e-95f9-5b71-8f28-7ecf81ed973d'),
-- check start-a1-bahnhof german_linguistic id=d83f7c85-d0db-5c7b-8792-0c2dc62d6ff9 idem=7c8d1445-c1de-573b-a02f-f70a4fc03a8f
  ('start-a1-bahnhof', 'german_linguistic', 'd83f7c85-d0db-5c7b-8792-0c2dc62d6ff9', '7c8d1445-c1de-573b-a02f-f70a4fc03a8f'),
-- check start-a1-bahnhof persian_translation id=11c3727d-ed40-57ec-9a5a-e684f53bc82e idem=de828268-5841-5691-ada4-0ca5523405db
  ('start-a1-bahnhof', 'persian_translation', '11c3727d-ed40-57ec-9a5a-e684f53bc82e', 'de828268-5841-5691-ada4-0ca5523405db'),
-- check start-a1-bahnhof provenance id=19336626-d7cc-5cb1-b9bc-7ec36a6f4085 idem=50c26370-d80d-5a76-a354-9cc74a3c9cad
  ('start-a1-bahnhof', 'provenance', '19336626-d7cc-5cb1-b9bc-7ec36a6f4085', '50c26370-d80d-5a76-a354-9cc74a3c9cad'),
-- check start-a1-bahnhof visual id=f0b0786e-a028-5e5c-aeb2-52cba9c45c61 idem=3e326f2c-143c-5f21-891f-4cf2dc6d32ce
  ('start-a1-bahnhof', 'visual', 'f0b0786e-a028-5e5c-aeb2-52cba9c45c61', '3e326f2c-143c-5f21-891f-4cf2dc6d32ce'),
-- check start-a1-bahnhof audio id=f42a978a-4f5f-53d4-932a-68e9669f2a07 idem=5daba634-fbb7-5248-a6e0-9a07f8f9263a
  ('start-a1-bahnhof', 'audio', 'f42a978a-4f5f-53d4-932a-68e9669f2a07', '5daba634-fbb7-5248-a6e0-9a07f8f9263a'),
-- check start-a1-bahnhof app_flow id=8a7e26ae-6b72-5d8f-93c4-c7c8b390031e idem=626b4906-a702-57f1-ad9f-27bc38349e50
  ('start-a1-bahnhof', 'app_flow', '8a7e26ae-6b72-5d8f-93c4-c7c8b390031e', '626b4906-a702-57f1-ad9f-27bc38349e50'),
-- check start-a1-bett german_linguistic id=f4b2d843-1570-5f88-b532-5b079060a641 idem=3ee63e2e-8154-5cb6-a097-237eb416ea01
  ('start-a1-bett', 'german_linguistic', 'f4b2d843-1570-5f88-b532-5b079060a641', '3ee63e2e-8154-5cb6-a097-237eb416ea01'),
-- check start-a1-bett persian_translation id=5d678331-8bdc-5c6d-9c0a-4bbcbec7fe4f idem=b332f388-83ea-570a-a713-9376bd789c3a
  ('start-a1-bett', 'persian_translation', '5d678331-8bdc-5c6d-9c0a-4bbcbec7fe4f', 'b332f388-83ea-570a-a713-9376bd789c3a'),
-- check start-a1-bett provenance id=4014fd74-e972-58aa-9680-e76b10d9d925 idem=6b472957-0290-53a5-8d4e-cfae5464129f
  ('start-a1-bett', 'provenance', '4014fd74-e972-58aa-9680-e76b10d9d925', '6b472957-0290-53a5-8d4e-cfae5464129f'),
-- check start-a1-bett visual id=9859cffd-2144-5c8a-a40d-260ea78d2f52 idem=555d80ae-c550-59e1-83b4-49ba07574146
  ('start-a1-bett', 'visual', '9859cffd-2144-5c8a-a40d-260ea78d2f52', '555d80ae-c550-59e1-83b4-49ba07574146'),
-- check start-a1-bett audio id=e66df1ad-ba2e-5f41-bcb7-39e6129997a5 idem=ded207fe-776e-509b-aabe-770ca3dd24f2
  ('start-a1-bett', 'audio', 'e66df1ad-ba2e-5f41-bcb7-39e6129997a5', 'ded207fe-776e-509b-aabe-770ca3dd24f2'),
-- check start-a1-bett app_flow id=73ab7834-c33f-53d9-99db-cd7c4a5528a5 idem=2394eafe-5e34-53a9-b34a-e63048f2c8ef
  ('start-a1-bett', 'app_flow', '73ab7834-c33f-53d9-99db-cd7c4a5528a5', '2394eafe-5e34-53a9-b34a-e63048f2c8ef'),
-- check start-a1-brot german_linguistic id=bdce08e2-8597-5749-a6fa-7d1c26830637 idem=8a9f3a0f-2085-5e18-9954-4b6b53e54c5d
  ('start-a1-brot', 'german_linguistic', 'bdce08e2-8597-5749-a6fa-7d1c26830637', '8a9f3a0f-2085-5e18-9954-4b6b53e54c5d'),
-- check start-a1-brot persian_translation id=72502f40-9961-5149-800b-23bff72b1c94 idem=a46bef5d-3427-5c97-98d3-bba2217a297a
  ('start-a1-brot', 'persian_translation', '72502f40-9961-5149-800b-23bff72b1c94', 'a46bef5d-3427-5c97-98d3-bba2217a297a'),
-- check start-a1-brot provenance id=7c492219-1ec2-535d-9914-71c75e9f79c7 idem=d8d0e71b-4241-587a-8641-7114d7ae7f47
  ('start-a1-brot', 'provenance', '7c492219-1ec2-535d-9914-71c75e9f79c7', 'd8d0e71b-4241-587a-8641-7114d7ae7f47'),
-- check start-a1-brot visual id=e5f66ae8-0ae0-5744-bd8d-7e34415fe772 idem=5dca54e3-8752-50ee-ba62-eee29cd2da05
  ('start-a1-brot', 'visual', 'e5f66ae8-0ae0-5744-bd8d-7e34415fe772', '5dca54e3-8752-50ee-ba62-eee29cd2da05'),
-- check start-a1-brot audio id=6e575ae2-38e1-586d-9b54-6757d9d0d5a7 idem=eed9a801-eb81-5725-8ee1-cc66bb2ff719
  ('start-a1-brot', 'audio', '6e575ae2-38e1-586d-9b54-6757d9d0d5a7', 'eed9a801-eb81-5725-8ee1-cc66bb2ff719'),
-- check start-a1-brot app_flow id=376981e0-5dd7-5584-b927-e1ff5085e752 idem=1bc94ef3-f6d1-5cb6-b8ce-793b6953f528
  ('start-a1-brot', 'app_flow', '376981e0-5dd7-5584-b927-e1ff5085e752', '1bc94ef3-f6d1-5cb6-b8ce-793b6953f528'),
-- check start-a1-danke german_linguistic id=37410147-0fcd-55c7-a619-c5310706e2be idem=faeb871c-775c-5424-ab08-72943aeb2bf2
  ('start-a1-danke', 'german_linguistic', '37410147-0fcd-55c7-a619-c5310706e2be', 'faeb871c-775c-5424-ab08-72943aeb2bf2'),
-- check start-a1-danke persian_translation id=87d6401d-e733-5350-9532-9bea592ff66f idem=5621e967-7c2e-5f21-acdc-21c8544aca97
  ('start-a1-danke', 'persian_translation', '87d6401d-e733-5350-9532-9bea592ff66f', '5621e967-7c2e-5f21-acdc-21c8544aca97'),
-- check start-a1-danke provenance id=cc807ed2-74d2-5c49-8a93-e6092f7a379a idem=b812b4c4-88f5-5723-939f-e3389a104a4a
  ('start-a1-danke', 'provenance', 'cc807ed2-74d2-5c49-8a93-e6092f7a379a', 'b812b4c4-88f5-5723-939f-e3389a104a4a'),
-- check start-a1-danke visual id=7fe1c1f9-8ed7-5b43-b54f-1d53363aa6c6 idem=4412e4fd-26ab-5e83-8b3b-049a4d87110a
  ('start-a1-danke', 'visual', '7fe1c1f9-8ed7-5b43-b54f-1d53363aa6c6', '4412e4fd-26ab-5e83-8b3b-049a4d87110a'),
-- check start-a1-danke audio id=4bc6998f-2e7e-52b0-b766-7f3388b237d4 idem=6f8da769-02df-5f29-95b0-29b37eead9ce
  ('start-a1-danke', 'audio', '4bc6998f-2e7e-52b0-b766-7f3388b237d4', '6f8da769-02df-5f29-95b0-29b37eead9ce'),
-- check start-a1-danke app_flow id=06a02451-28db-5591-944a-803d8bf47dfe idem=ba589714-4716-5b5a-9137-601701135c16
  ('start-a1-danke', 'app_flow', '06a02451-28db-5591-944a-803d8bf47dfe', 'ba589714-4716-5b5a-9137-601701135c16'),
-- check start-a1-ei german_linguistic id=81da208b-1c1e-5153-8c9d-c9aef7403b82 idem=5752ccd0-ab9c-5c1f-a54c-06921d982212
  ('start-a1-ei', 'german_linguistic', '81da208b-1c1e-5153-8c9d-c9aef7403b82', '5752ccd0-ab9c-5c1f-a54c-06921d982212'),
-- check start-a1-ei persian_translation id=bd09c956-907c-52e0-890a-ed72223dfba7 idem=0b227f0f-7801-5723-ba6a-98b763f21d5c
  ('start-a1-ei', 'persian_translation', 'bd09c956-907c-52e0-890a-ed72223dfba7', '0b227f0f-7801-5723-ba6a-98b763f21d5c'),
-- check start-a1-ei provenance id=10e36df9-c0f6-5bcc-9f85-79c735d623cd idem=1a1232cf-f824-523b-a156-1045ff1253d6
  ('start-a1-ei', 'provenance', '10e36df9-c0f6-5bcc-9f85-79c735d623cd', '1a1232cf-f824-523b-a156-1045ff1253d6'),
-- check start-a1-ei visual id=19258d2f-0649-58fe-85bb-722050de58a6 idem=e9c73984-d71b-5d7f-baba-6affd376bd89
  ('start-a1-ei', 'visual', '19258d2f-0649-58fe-85bb-722050de58a6', 'e9c73984-d71b-5d7f-baba-6affd376bd89'),
-- check start-a1-ei audio id=d3703d61-ff8c-58d3-8f04-8a2d1610429d idem=c495cc0c-9306-5dfc-b658-4e1d41a09e1a
  ('start-a1-ei', 'audio', 'd3703d61-ff8c-58d3-8f04-8a2d1610429d', 'c495cc0c-9306-5dfc-b658-4e1d41a09e1a'),
-- check start-a1-ei app_flow id=f6e185a5-059c-520c-8738-bb76db7f3ae1 idem=cfa13c01-4669-517b-a826-f0e74cb22cea
  ('start-a1-ei', 'app_flow', 'f6e185a5-059c-520c-8738-bb76db7f3ae1', 'cfa13c01-4669-517b-a826-f0e74cb22cea'),
-- check start-a1-entschuldigung german_linguistic id=8f3d5be2-4fec-5fce-82eb-852300b0e286 idem=3b8a7c3a-3173-59ca-ba67-de173a6975c4
  ('start-a1-entschuldigung', 'german_linguistic', '8f3d5be2-4fec-5fce-82eb-852300b0e286', '3b8a7c3a-3173-59ca-ba67-de173a6975c4'),
-- check start-a1-entschuldigung persian_translation id=bd038f92-3c7a-58af-a3d9-cee6924fb2e1 idem=6742cdcc-8278-5d8a-a3e6-a9c895b314a8
  ('start-a1-entschuldigung', 'persian_translation', 'bd038f92-3c7a-58af-a3d9-cee6924fb2e1', '6742cdcc-8278-5d8a-a3e6-a9c895b314a8'),
-- check start-a1-entschuldigung provenance id=9b3147dd-81e9-5635-84ac-8f7e3f257bdc idem=9c12db07-c697-51f0-89da-f6a3b7f48ba1
  ('start-a1-entschuldigung', 'provenance', '9b3147dd-81e9-5635-84ac-8f7e3f257bdc', '9c12db07-c697-51f0-89da-f6a3b7f48ba1'),
-- check start-a1-entschuldigung visual id=54db2621-c17c-5a03-8c95-b435da9d15c3 idem=8462078e-ae5d-5f40-8a9f-411c8bdb11ab
  ('start-a1-entschuldigung', 'visual', '54db2621-c17c-5a03-8c95-b435da9d15c3', '8462078e-ae5d-5f40-8a9f-411c8bdb11ab'),
-- check start-a1-entschuldigung audio id=0e7109af-feeb-5568-b1b2-bb0d3d3fd19b idem=f65b894e-27ef-53a2-b8df-cedc0e36c1fe
  ('start-a1-entschuldigung', 'audio', '0e7109af-feeb-5568-b1b2-bb0d3d3fd19b', 'f65b894e-27ef-53a2-b8df-cedc0e36c1fe'),
-- check start-a1-entschuldigung app_flow id=6f3f0453-22d3-51a9-9712-1f6697329a01 idem=3e4db4cc-1087-5d33-ac61-1ec5ec21079b
  ('start-a1-entschuldigung', 'app_flow', '6f3f0453-22d3-51a9-9712-1f6697329a01', '3e4db4cc-1087-5d33-ac61-1ec5ec21079b'),
-- check start-a1-essen german_linguistic id=ccaecfed-c856-5acd-9add-b268516d62a1 idem=43690662-ea7a-50dc-a822-de79f5a09332
  ('start-a1-essen', 'german_linguistic', 'ccaecfed-c856-5acd-9add-b268516d62a1', '43690662-ea7a-50dc-a822-de79f5a09332'),
-- check start-a1-essen persian_translation id=a1ab4917-7f97-5009-8e83-ffc1030e6c1f idem=9c085647-233b-5803-97a6-55430500cf99
  ('start-a1-essen', 'persian_translation', 'a1ab4917-7f97-5009-8e83-ffc1030e6c1f', '9c085647-233b-5803-97a6-55430500cf99'),
-- check start-a1-essen provenance id=4da24efa-1239-54d9-aa15-728249800ca5 idem=2d875f92-a35f-5fce-93c5-469ee2abb4f5
  ('start-a1-essen', 'provenance', '4da24efa-1239-54d9-aa15-728249800ca5', '2d875f92-a35f-5fce-93c5-469ee2abb4f5'),
-- check start-a1-essen visual id=b2612216-62cf-5e11-a193-b4709cc5b9b3 idem=1e52dfff-1eb5-5893-b7b9-8d07410f8c1d
  ('start-a1-essen', 'visual', 'b2612216-62cf-5e11-a193-b4709cc5b9b3', '1e52dfff-1eb5-5893-b7b9-8d07410f8c1d'),
-- check start-a1-essen audio id=6dbdaf83-4087-5e27-9788-1afa9317a7db idem=071fbc8c-38f8-57f8-98d2-cea8b6251869
  ('start-a1-essen', 'audio', '6dbdaf83-4087-5e27-9788-1afa9317a7db', '071fbc8c-38f8-57f8-98d2-cea8b6251869'),
-- check start-a1-essen app_flow id=60aa0f47-d2a6-5c03-8067-59857e6a1d64 idem=14174481-bde3-5a57-9c42-29745fe4bf68
  ('start-a1-essen', 'app_flow', '60aa0f47-d2a6-5c03-8067-59857e6a1d64', '14174481-bde3-5a57-9c42-29745fe4bf68'),
-- check start-a1-fenster german_linguistic id=9b9fd558-eab8-58b0-b0ae-eb1d5b5725b4 idem=8eba337f-b009-5398-b6a0-af429dcbcac3
  ('start-a1-fenster', 'german_linguistic', '9b9fd558-eab8-58b0-b0ae-eb1d5b5725b4', '8eba337f-b009-5398-b6a0-af429dcbcac3'),
-- check start-a1-fenster persian_translation id=66426e35-4505-5c6b-9bcd-2f80d76eea33 idem=20b31c53-aca4-5a18-95ef-8ab07538df52
  ('start-a1-fenster', 'persian_translation', '66426e35-4505-5c6b-9bcd-2f80d76eea33', '20b31c53-aca4-5a18-95ef-8ab07538df52'),
-- check start-a1-fenster provenance id=77ced656-4af7-5b56-8364-57e0f55f902b idem=8e751398-c16d-599f-ab01-1a76a765ca1f
  ('start-a1-fenster', 'provenance', '77ced656-4af7-5b56-8364-57e0f55f902b', '8e751398-c16d-599f-ab01-1a76a765ca1f'),
-- check start-a1-fenster visual id=2db449d7-bdbe-5f0e-94b8-bf9a6b399533 idem=aa6fba92-8014-5dec-9712-48ddf0f6817f
  ('start-a1-fenster', 'visual', '2db449d7-bdbe-5f0e-94b8-bf9a6b399533', 'aa6fba92-8014-5dec-9712-48ddf0f6817f'),
-- check start-a1-fenster audio id=4b721efd-7530-584a-9a23-3bf497e8b82a idem=aa5be674-e2fd-5082-b9a2-723da23a186b
  ('start-a1-fenster', 'audio', '4b721efd-7530-584a-9a23-3bf497e8b82a', 'aa5be674-e2fd-5082-b9a2-723da23a186b'),
-- check start-a1-fenster app_flow id=3e2d852c-d0d1-5d78-9964-1c083115d956 idem=ee3ca01c-2b36-5bc0-b74c-ef8420c75b18
  ('start-a1-fenster', 'app_flow', '3e2d852c-d0d1-5d78-9964-1c083115d956', 'ee3ca01c-2b36-5bc0-b74c-ef8420c75b18'),
-- check start-a1-gehen german_linguistic id=4f5b993c-8473-5a66-9838-dc4758a15b59 idem=2ce6d3c9-265f-59f5-bafd-1a039af60601
  ('start-a1-gehen', 'german_linguistic', '4f5b993c-8473-5a66-9838-dc4758a15b59', '2ce6d3c9-265f-59f5-bafd-1a039af60601'),
-- check start-a1-gehen persian_translation id=0cc6a6cd-21c5-586c-bb6c-3224a03702e8 idem=1d063538-53f0-5ed3-b037-fa5ca1c326e3
  ('start-a1-gehen', 'persian_translation', '0cc6a6cd-21c5-586c-bb6c-3224a03702e8', '1d063538-53f0-5ed3-b037-fa5ca1c326e3'),
-- check start-a1-gehen provenance id=7418095a-9628-5f8c-a37e-2ddfe5b2340e idem=57205cca-c1b8-5d7d-b6a7-fba834422d61
  ('start-a1-gehen', 'provenance', '7418095a-9628-5f8c-a37e-2ddfe5b2340e', '57205cca-c1b8-5d7d-b6a7-fba834422d61'),
-- check start-a1-gehen visual id=5c6abd7e-daf7-557e-a388-a617cac233f0 idem=e771adff-f7a6-5902-a500-f69f1145508e
  ('start-a1-gehen', 'visual', '5c6abd7e-daf7-557e-a388-a617cac233f0', 'e771adff-f7a6-5902-a500-f69f1145508e'),
-- check start-a1-gehen audio id=05b7d517-91ce-5060-baad-64ec7e3381a4 idem=ce808863-7d39-5dee-908b-d7040f449c4e
  ('start-a1-gehen', 'audio', '05b7d517-91ce-5060-baad-64ec7e3381a4', 'ce808863-7d39-5dee-908b-d7040f449c4e'),
-- check start-a1-gehen app_flow id=52595d8f-0557-5983-84e2-0075834ecf2a idem=081b6bab-b54d-556a-b7d7-606c996bf505
  ('start-a1-gehen', 'app_flow', '52595d8f-0557-5983-84e2-0075834ecf2a', '081b6bab-b54d-556a-b7d7-606c996bf505'),
-- check start-a1-gluecklich german_linguistic id=be0bac14-6eec-5893-b903-74ebc8159a1c idem=a20cb060-8af4-5209-97af-228d20e4bd77
  ('start-a1-gluecklich', 'german_linguistic', 'be0bac14-6eec-5893-b903-74ebc8159a1c', 'a20cb060-8af4-5209-97af-228d20e4bd77'),
-- check start-a1-gluecklich persian_translation id=dbba3ae7-a713-583b-a207-5619ecffad04 idem=833ff231-d72d-5130-9cff-1adcb5a1b716
  ('start-a1-gluecklich', 'persian_translation', 'dbba3ae7-a713-583b-a207-5619ecffad04', '833ff231-d72d-5130-9cff-1adcb5a1b716'),
-- check start-a1-gluecklich provenance id=bd3b872d-0e78-5f14-8847-bc3e21195832 idem=9960cb2b-6455-586e-8a02-31cf87753486
  ('start-a1-gluecklich', 'provenance', 'bd3b872d-0e78-5f14-8847-bc3e21195832', '9960cb2b-6455-586e-8a02-31cf87753486'),
-- check start-a1-gluecklich visual id=85a683a7-d729-599a-b4e0-36ccd74d0f9e idem=32aefe65-9115-58ed-b9de-74ab74c5053f
  ('start-a1-gluecklich', 'visual', '85a683a7-d729-599a-b4e0-36ccd74d0f9e', '32aefe65-9115-58ed-b9de-74ab74c5053f'),
-- check start-a1-gluecklich audio id=229ceef5-7b77-5eeb-8436-e55c33b48e46 idem=3a073cbe-c6a7-5ec3-a8fd-f5024d4d413a
  ('start-a1-gluecklich', 'audio', '229ceef5-7b77-5eeb-8436-e55c33b48e46', '3a073cbe-c6a7-5ec3-a8fd-f5024d4d413a'),
-- check start-a1-gluecklich app_flow id=942f182d-53b7-5f24-b6b7-234ee9764e92 idem=45065b8b-b450-5846-bf04-587bf77cb7fe
  ('start-a1-gluecklich', 'app_flow', '942f182d-53b7-5f24-b6b7-234ee9764e92', '45065b8b-b450-5846-bf04-587bf77cb7fe'),
-- check start-a1-gross german_linguistic id=ea2da863-e445-5a12-8bee-9ca17bf128a7 idem=acedfe84-52a3-573b-a19a-b5b97a4c7f17
  ('start-a1-gross', 'german_linguistic', 'ea2da863-e445-5a12-8bee-9ca17bf128a7', 'acedfe84-52a3-573b-a19a-b5b97a4c7f17'),
-- check start-a1-gross persian_translation id=bdf71333-4e94-52e8-801c-a541f16c886b idem=4ea8ed91-e595-5130-ae39-01a5d7dd6b8f
  ('start-a1-gross', 'persian_translation', 'bdf71333-4e94-52e8-801c-a541f16c886b', '4ea8ed91-e595-5130-ae39-01a5d7dd6b8f'),
-- check start-a1-gross provenance id=cee92117-8897-591d-b919-8d879bb6de7f idem=22ac2ca9-0a3d-556b-bcc8-dedda798f2da
  ('start-a1-gross', 'provenance', 'cee92117-8897-591d-b919-8d879bb6de7f', '22ac2ca9-0a3d-556b-bcc8-dedda798f2da'),
-- check start-a1-gross visual id=7355651e-1357-5ada-bae6-5c993165ac1d idem=db203695-ec4f-5b83-82fb-5b626c3c6a43
  ('start-a1-gross', 'visual', '7355651e-1357-5ada-bae6-5c993165ac1d', 'db203695-ec4f-5b83-82fb-5b626c3c6a43'),
-- check start-a1-gross audio id=00778131-da95-5824-8cad-c3e4eb0bb77f idem=ab35aa8e-7b51-5d8e-a4a4-0e30111d0b3b
  ('start-a1-gross', 'audio', '00778131-da95-5824-8cad-c3e4eb0bb77f', 'ab35aa8e-7b51-5d8e-a4a4-0e30111d0b3b'),
-- check start-a1-gross app_flow id=cdc7355d-295c-553e-9761-40ce61f95fda idem=8d8fcfd5-0e58-5e77-abee-f3f8ef46d75c
  ('start-a1-gross', 'app_flow', 'cdc7355d-295c-553e-9761-40ce61f95fda', '8d8fcfd5-0e58-5e77-abee-f3f8ef46d75c'),
-- check start-a1-guten-tag german_linguistic id=f7044ce7-9a53-5acd-ae00-18d2add2bc1d idem=ddf2a0a3-5c2f-51bc-a814-c681af8a9b4f
  ('start-a1-guten-tag', 'german_linguistic', 'f7044ce7-9a53-5acd-ae00-18d2add2bc1d', 'ddf2a0a3-5c2f-51bc-a814-c681af8a9b4f'),
-- check start-a1-guten-tag persian_translation id=7363bba7-ac08-5f89-b9b7-47df259363de idem=675a48da-da1e-5944-910c-5d72c01be920
  ('start-a1-guten-tag', 'persian_translation', '7363bba7-ac08-5f89-b9b7-47df259363de', '675a48da-da1e-5944-910c-5d72c01be920'),
-- check start-a1-guten-tag provenance id=bb5ebf60-9fe2-5738-a0bb-1513602dd98f idem=b709185d-28c9-5832-85b2-d8d753ef4ab9
  ('start-a1-guten-tag', 'provenance', 'bb5ebf60-9fe2-5738-a0bb-1513602dd98f', 'b709185d-28c9-5832-85b2-d8d753ef4ab9'),
-- check start-a1-guten-tag visual id=de2d2e81-4e0b-514d-bf5c-570d3680e6e4 idem=723591a5-65bb-57c4-8fde-4f31c63e57ee
  ('start-a1-guten-tag', 'visual', 'de2d2e81-4e0b-514d-bf5c-570d3680e6e4', '723591a5-65bb-57c4-8fde-4f31c63e57ee'),
-- check start-a1-guten-tag audio id=aafe03af-3aaa-58e9-923d-b113ca095516 idem=dd9c28dd-7472-5cd1-ba7a-b67f51bc4b2e
  ('start-a1-guten-tag', 'audio', 'aafe03af-3aaa-58e9-923d-b113ca095516', 'dd9c28dd-7472-5cd1-ba7a-b67f51bc4b2e'),
-- check start-a1-guten-tag app_flow id=3709ea32-f8df-5d4b-9a25-245e6833ebb0 idem=885dd8d3-724c-5e2a-9244-b80e017c9702
  ('start-a1-guten-tag', 'app_flow', '3709ea32-f8df-5d4b-9a25-245e6833ebb0', '885dd8d3-724c-5e2a-9244-b80e017c9702'),
-- check start-a1-haus german_linguistic id=9284e556-51a8-5634-bd54-611774f10cd9 idem=caa8f906-8f7d-5c52-8bae-c21df96ccdf9
  ('start-a1-haus', 'german_linguistic', '9284e556-51a8-5634-bd54-611774f10cd9', 'caa8f906-8f7d-5c52-8bae-c21df96ccdf9'),
-- check start-a1-haus persian_translation id=adb1ea3d-5d6c-5c63-adcd-3b435122e97a idem=8b971fcb-8510-594b-8ea4-1f6f48c66f59
  ('start-a1-haus', 'persian_translation', 'adb1ea3d-5d6c-5c63-adcd-3b435122e97a', '8b971fcb-8510-594b-8ea4-1f6f48c66f59'),
-- check start-a1-haus provenance id=a7bc5179-9101-554c-a975-b128fbda0b48 idem=d87ad00c-9af4-5fae-bd60-2e39d2137049
  ('start-a1-haus', 'provenance', 'a7bc5179-9101-554c-a975-b128fbda0b48', 'd87ad00c-9af4-5fae-bd60-2e39d2137049'),
-- check start-a1-haus visual id=fd1a368d-85b7-52b4-9ec5-739f4d79c460 idem=58754101-a130-51e9-b826-f529f18e9b56
  ('start-a1-haus', 'visual', 'fd1a368d-85b7-52b4-9ec5-739f4d79c460', '58754101-a130-51e9-b826-f529f18e9b56'),
-- check start-a1-haus audio id=5f8622bb-35a0-5d4f-9544-9bbc8b58b9df idem=ad616471-3832-5c45-bfa8-8bad761a7108
  ('start-a1-haus', 'audio', '5f8622bb-35a0-5d4f-9544-9bbc8b58b9df', 'ad616471-3832-5c45-bfa8-8bad761a7108'),
-- check start-a1-haus app_flow id=09172716-9f94-562b-85af-076a935184e3 idem=88df8015-3dda-525a-8be0-297d3b836ed2
  ('start-a1-haus', 'app_flow', '09172716-9f94-562b-85af-076a935184e3', '88df8015-3dda-525a-8be0-297d3b836ed2'),
-- check start-a1-kaffee german_linguistic id=1e08c0ce-9a63-5298-9b40-d6cd2ecabc22 idem=3d56d2da-e5b6-528b-bc29-d971ab58c2a0
  ('start-a1-kaffee', 'german_linguistic', '1e08c0ce-9a63-5298-9b40-d6cd2ecabc22', '3d56d2da-e5b6-528b-bc29-d971ab58c2a0'),
-- check start-a1-kaffee persian_translation id=83dc0f13-c04a-501e-a099-526efc126d14 idem=2752a6f0-2cdc-51cf-a39b-1b2df4d4a79d
  ('start-a1-kaffee', 'persian_translation', '83dc0f13-c04a-501e-a099-526efc126d14', '2752a6f0-2cdc-51cf-a39b-1b2df4d4a79d'),
-- check start-a1-kaffee provenance id=c0bbd48b-59d6-5359-ba77-a05919e74443 idem=5e412ca8-078b-5f29-a144-852d24d002b7
  ('start-a1-kaffee', 'provenance', 'c0bbd48b-59d6-5359-ba77-a05919e74443', '5e412ca8-078b-5f29-a144-852d24d002b7'),
-- check start-a1-kaffee visual id=feb47da4-6000-5248-9051-9712e9ad1c37 idem=9742a527-ef3a-55da-9338-827d073fbb50
  ('start-a1-kaffee', 'visual', 'feb47da4-6000-5248-9051-9712e9ad1c37', '9742a527-ef3a-55da-9338-827d073fbb50'),
-- check start-a1-kaffee audio id=87e3ae99-944e-5874-8d81-a26866e77cc3 idem=4ce283df-7c3d-5c28-9c05-def20869d8d2
  ('start-a1-kaffee', 'audio', '87e3ae99-944e-5874-8d81-a26866e77cc3', '4ce283df-7c3d-5c28-9c05-def20869d8d2'),
-- check start-a1-kaffee app_flow id=d9199587-ac49-52f3-b5b7-d884ab5b7cad idem=c89a251b-c226-5578-8c17-f8645198ebdf
  ('start-a1-kaffee', 'app_flow', 'd9199587-ac49-52f3-b5b7-d884ab5b7cad', 'c89a251b-c226-5578-8c17-f8645198ebdf'),
-- check start-a1-kalt german_linguistic id=6a84c904-6fbe-5a94-8954-b3ae77dd8637 idem=3e516191-63b4-5407-9ec8-2ffa70dc4575
  ('start-a1-kalt', 'german_linguistic', '6a84c904-6fbe-5a94-8954-b3ae77dd8637', '3e516191-63b4-5407-9ec8-2ffa70dc4575'),
-- check start-a1-kalt persian_translation id=0a18b32f-97c0-54b4-a292-3509a0422b2e idem=f4907ac2-2fa9-5a78-9a4b-b320878c7aca
  ('start-a1-kalt', 'persian_translation', '0a18b32f-97c0-54b4-a292-3509a0422b2e', 'f4907ac2-2fa9-5a78-9a4b-b320878c7aca'),
-- check start-a1-kalt provenance id=8f82cd3a-4fe4-5782-94c6-7e96b8a9d2b2 idem=bdf46a40-1d8b-5d1a-803f-a3a9b2f218ec
  ('start-a1-kalt', 'provenance', '8f82cd3a-4fe4-5782-94c6-7e96b8a9d2b2', 'bdf46a40-1d8b-5d1a-803f-a3a9b2f218ec'),
-- check start-a1-kalt visual id=8b7cf6f4-e9cc-5494-8941-cdf0422490d5 idem=43f07f6d-bf2b-5f35-80e7-086071c9fdb9
  ('start-a1-kalt', 'visual', '8b7cf6f4-e9cc-5494-8941-cdf0422490d5', '43f07f6d-bf2b-5f35-80e7-086071c9fdb9'),
-- check start-a1-kalt audio id=c61bae4d-7d7b-5b0b-9455-c0cc80e7a7cf idem=4b5b5c04-5030-5adf-bb75-e5de9ae59874
  ('start-a1-kalt', 'audio', 'c61bae4d-7d7b-5b0b-9455-c0cc80e7a7cf', '4b5b5c04-5030-5adf-bb75-e5de9ae59874'),
-- check start-a1-kalt app_flow id=d894238e-f47b-5814-90b5-17d5e4c93751 idem=48400e07-eb63-5ac1-806f-22e17d1a1351
  ('start-a1-kalt', 'app_flow', 'd894238e-f47b-5814-90b5-17d5e4c93751', '48400e07-eb63-5ac1-806f-22e17d1a1351'),
-- check start-a1-kaufen german_linguistic id=ad2457b7-ec2d-5fb9-bbd3-2742656b376f idem=3c15ba5a-a4fc-5bdf-9dbb-9319344628b2
  ('start-a1-kaufen', 'german_linguistic', 'ad2457b7-ec2d-5fb9-bbd3-2742656b376f', '3c15ba5a-a4fc-5bdf-9dbb-9319344628b2'),
-- check start-a1-kaufen persian_translation id=07bbe545-95c5-5eb9-ad22-0058511a1ff5 idem=3cbb5002-a02a-5f53-bcd4-2ddf2b9bff69
  ('start-a1-kaufen', 'persian_translation', '07bbe545-95c5-5eb9-ad22-0058511a1ff5', '3cbb5002-a02a-5f53-bcd4-2ddf2b9bff69'),
-- check start-a1-kaufen provenance id=693b14a1-f670-5ea6-bc00-cbaf22dd0402 idem=a3c844bf-f9dc-5510-95ec-4295550e15f3
  ('start-a1-kaufen', 'provenance', '693b14a1-f670-5ea6-bc00-cbaf22dd0402', 'a3c844bf-f9dc-5510-95ec-4295550e15f3'),
-- check start-a1-kaufen visual id=57818166-ee30-50aa-8e4d-33a948e811e3 idem=aa6f053e-8ae6-5e20-896e-9c09ab083bf6
  ('start-a1-kaufen', 'visual', '57818166-ee30-50aa-8e4d-33a948e811e3', 'aa6f053e-8ae6-5e20-896e-9c09ab083bf6'),
-- check start-a1-kaufen audio id=f81000d8-1d24-534d-bf04-c3ac80693193 idem=b0e4e35b-a6b7-58f0-bb6a-54d49a291893
  ('start-a1-kaufen', 'audio', 'f81000d8-1d24-534d-bf04-c3ac80693193', 'b0e4e35b-a6b7-58f0-bb6a-54d49a291893'),
-- check start-a1-kaufen app_flow id=c70d5dd3-31d8-58d9-a855-e0026b3cf5f9 idem=51f06956-973e-50ec-af71-f83ca7c28f6e
  ('start-a1-kaufen', 'app_flow', 'c70d5dd3-31d8-58d9-a855-e0026b3cf5f9', '51f06956-973e-50ec-af71-f83ca7c28f6e'),
-- check start-a1-klein german_linguistic id=57d90ac4-f53c-5c43-a76e-6618c1aab35b idem=f7cdd463-8b59-5b64-814e-e183e4596168
  ('start-a1-klein', 'german_linguistic', '57d90ac4-f53c-5c43-a76e-6618c1aab35b', 'f7cdd463-8b59-5b64-814e-e183e4596168'),
-- check start-a1-klein persian_translation id=77f4929a-c73f-51cd-ad69-5272de3f6ce2 idem=7500520f-14ce-50a5-9601-42c9ca27baa6
  ('start-a1-klein', 'persian_translation', '77f4929a-c73f-51cd-ad69-5272de3f6ce2', '7500520f-14ce-50a5-9601-42c9ca27baa6'),
-- check start-a1-klein provenance id=11475bcd-10c9-5748-b11b-5101f1d22ee1 idem=56827f0f-a65c-549f-88f4-c052d0ce64e2
  ('start-a1-klein', 'provenance', '11475bcd-10c9-5748-b11b-5101f1d22ee1', '56827f0f-a65c-549f-88f4-c052d0ce64e2'),
-- check start-a1-klein visual id=822fc74b-bde7-56b6-a407-228775eb6d40 idem=2096b38d-d92c-5869-8ee2-b6b44bc9d988
  ('start-a1-klein', 'visual', '822fc74b-bde7-56b6-a407-228775eb6d40', '2096b38d-d92c-5869-8ee2-b6b44bc9d988'),
-- check start-a1-klein audio id=d9d0cc6e-c2e1-5850-a38b-d7ac32f3e4e5 idem=41314e5d-7d00-59a1-90d5-c515a6a76af0
  ('start-a1-klein', 'audio', 'd9d0cc6e-c2e1-5850-a38b-d7ac32f3e4e5', '41314e5d-7d00-59a1-90d5-c515a6a76af0'),
-- check start-a1-klein app_flow id=f4ab0ed2-89f6-519f-8587-2821315cfd74 idem=710937d0-2546-5d51-90fd-04c91552e32d
  ('start-a1-klein', 'app_flow', 'f4ab0ed2-89f6-519f-8587-2821315cfd74', '710937d0-2546-5d51-90fd-04c91552e32d'),
-- check start-a1-lernen german_linguistic id=7f7f6a4c-54a0-5e76-97a7-e4b2d818a591 idem=8747b87c-4518-5cb7-a308-3e96c7ffbb09
  ('start-a1-lernen', 'german_linguistic', '7f7f6a4c-54a0-5e76-97a7-e4b2d818a591', '8747b87c-4518-5cb7-a308-3e96c7ffbb09'),
-- check start-a1-lernen persian_translation id=8561750a-392f-5b1c-93b1-748022c01deb idem=f1193e07-6ae9-555f-93ff-8e07a5df3adc
  ('start-a1-lernen', 'persian_translation', '8561750a-392f-5b1c-93b1-748022c01deb', 'f1193e07-6ae9-555f-93ff-8e07a5df3adc'),
-- check start-a1-lernen provenance id=df3bda2b-e390-5ebb-902a-d3d120c7b145 idem=3eeb73d1-d666-5cd5-89c9-3d370e54feee
  ('start-a1-lernen', 'provenance', 'df3bda2b-e390-5ebb-902a-d3d120c7b145', '3eeb73d1-d666-5cd5-89c9-3d370e54feee'),
-- check start-a1-lernen visual id=04efdb16-3260-50ba-8495-3dba16193406 idem=b732de67-fd6f-54f9-ac3e-84ee182b24e6
  ('start-a1-lernen', 'visual', '04efdb16-3260-50ba-8495-3dba16193406', 'b732de67-fd6f-54f9-ac3e-84ee182b24e6'),
-- check start-a1-lernen audio id=cd5eb479-b82f-5ee3-bed4-df0d07d78ae5 idem=06d2399a-41cc-5b78-b89f-39f185b8020a
  ('start-a1-lernen', 'audio', 'cd5eb479-b82f-5ee3-bed4-df0d07d78ae5', '06d2399a-41cc-5b78-b89f-39f185b8020a'),
-- check start-a1-lernen app_flow id=ac5ceb7c-eb2a-574a-83de-06b810a383c9 idem=20d6b663-d69e-5bcc-9863-578b51884acd
  ('start-a1-lernen', 'app_flow', 'ac5ceb7c-eb2a-574a-83de-06b810a383c9', '20d6b663-d69e-5bcc-9863-578b51884acd'),
-- check start-a1-milch german_linguistic id=5bbcdf57-8848-5fce-8ae5-ef653af353f3 idem=ee49017b-54fa-5261-b189-e6c61b5f6dae
  ('start-a1-milch', 'german_linguistic', '5bbcdf57-8848-5fce-8ae5-ef653af353f3', 'ee49017b-54fa-5261-b189-e6c61b5f6dae'),
-- check start-a1-milch persian_translation id=a5503294-e8e5-5a96-90b6-dee3b17c5806 idem=0cabd157-7cf6-590e-9c6f-3497736f3d84
  ('start-a1-milch', 'persian_translation', 'a5503294-e8e5-5a96-90b6-dee3b17c5806', '0cabd157-7cf6-590e-9c6f-3497736f3d84'),
-- check start-a1-milch provenance id=61e5cf7c-737f-5e8e-94ae-a357e092fde0 idem=fe53a371-370c-512b-9f7b-2a9c05a8cd50
  ('start-a1-milch', 'provenance', '61e5cf7c-737f-5e8e-94ae-a357e092fde0', 'fe53a371-370c-512b-9f7b-2a9c05a8cd50'),
-- check start-a1-milch visual id=9663980c-a744-50f0-82f8-3ece99fd5a55 idem=85f8ac3c-4d7e-5df3-b0e5-25185a616a52
  ('start-a1-milch', 'visual', '9663980c-a744-50f0-82f8-3ece99fd5a55', '85f8ac3c-4d7e-5df3-b0e5-25185a616a52'),
-- check start-a1-milch audio id=f5aad4bc-b2ba-50b0-9c32-7f422e1557cf idem=bc650530-6d2a-5723-810c-0553f4b193e4
  ('start-a1-milch', 'audio', 'f5aad4bc-b2ba-50b0-9c32-7f422e1557cf', 'bc650530-6d2a-5723-810c-0553f4b193e4'),
-- check start-a1-milch app_flow id=b353c7be-f7de-53ce-88e2-b21b6a975181 idem=7193eaa3-0113-5b19-9eb4-5d4aa8dd2e34
  ('start-a1-milch', 'app_flow', 'b353c7be-f7de-53ce-88e2-b21b6a975181', '7193eaa3-0113-5b19-9eb4-5d4aa8dd2e34'),
-- check start-a1-muede german_linguistic id=d7294fd1-39ec-5cdd-8460-15cb9a3a4ea5 idem=632b125c-83c9-5a02-8ceb-7dd592e11261
  ('start-a1-muede', 'german_linguistic', 'd7294fd1-39ec-5cdd-8460-15cb9a3a4ea5', '632b125c-83c9-5a02-8ceb-7dd592e11261'),
-- check start-a1-muede persian_translation id=d7ebfb79-2d6d-5835-8923-9143c1eceef1 idem=c826a786-d6e8-5eeb-a11f-b88514025b21
  ('start-a1-muede', 'persian_translation', 'd7ebfb79-2d6d-5835-8923-9143c1eceef1', 'c826a786-d6e8-5eeb-a11f-b88514025b21'),
-- check start-a1-muede provenance id=2309cd77-ea41-5270-95dc-c4bc595228f3 idem=65867759-9ea4-53d0-bc9d-1e682d58fbfe
  ('start-a1-muede', 'provenance', '2309cd77-ea41-5270-95dc-c4bc595228f3', '65867759-9ea4-53d0-bc9d-1e682d58fbfe'),
-- check start-a1-muede visual id=67aad2e5-2a44-51f7-b0b4-d59193c3a1a9 idem=f9618476-19ca-5a7d-9a23-a953cc7a1004
  ('start-a1-muede', 'visual', '67aad2e5-2a44-51f7-b0b4-d59193c3a1a9', 'f9618476-19ca-5a7d-9a23-a953cc7a1004'),
-- check start-a1-muede audio id=efb71c70-c274-5651-a292-5b527e9f7357 idem=6068f5b1-9887-5636-aa82-938e4934b93d
  ('start-a1-muede', 'audio', 'efb71c70-c274-5651-a292-5b527e9f7357', '6068f5b1-9887-5636-aa82-938e4934b93d'),
-- check start-a1-muede app_flow id=ced6f7af-3e64-5528-8228-1f8988c1a87f idem=7f81ebaf-b4b0-5784-b948-bc88022f5ca4
  ('start-a1-muede', 'app_flow', 'ced6f7af-3e64-5528-8228-1f8988c1a87f', '7f81ebaf-b4b0-5784-b948-bc88022f5ca4'),
-- check start-a1-neu german_linguistic id=3f5caa5b-6d2d-5607-af2b-946b04552542 idem=b80cb861-1883-5013-941b-479cbb81df4d
  ('start-a1-neu', 'german_linguistic', '3f5caa5b-6d2d-5607-af2b-946b04552542', 'b80cb861-1883-5013-941b-479cbb81df4d'),
-- check start-a1-neu persian_translation id=ee2ffa22-5beb-501d-b931-438b8201e6d8 idem=18074418-4c87-5a38-acf9-24023ec04c81
  ('start-a1-neu', 'persian_translation', 'ee2ffa22-5beb-501d-b931-438b8201e6d8', '18074418-4c87-5a38-acf9-24023ec04c81'),
-- check start-a1-neu provenance id=c838a0ca-2b30-5706-833e-8acdc1c26d49 idem=4289e07c-6302-5c5c-ad3a-52433a583834
  ('start-a1-neu', 'provenance', 'c838a0ca-2b30-5706-833e-8acdc1c26d49', '4289e07c-6302-5c5c-ad3a-52433a583834'),
-- check start-a1-neu visual id=c891c5df-11b2-5bea-8486-a90ba72a525d idem=c22f3b4b-1017-572c-8654-40f9b349d6ee
  ('start-a1-neu', 'visual', 'c891c5df-11b2-5bea-8486-a90ba72a525d', 'c22f3b4b-1017-572c-8654-40f9b349d6ee'),
-- check start-a1-neu audio id=d3d20729-9a49-563a-979e-08f88a343add idem=4fa04d7a-cc5e-5cd2-8473-24e91f11e72f
  ('start-a1-neu', 'audio', 'd3d20729-9a49-563a-979e-08f88a343add', '4fa04d7a-cc5e-5cd2-8473-24e91f11e72f'),
-- check start-a1-neu app_flow id=c9cb653d-cec2-5269-bb61-33a6c748c3eb idem=76d4be91-ba6d-58cb-93aa-502b20b26bc3
  ('start-a1-neu', 'app_flow', 'c9cb653d-cec2-5269-bb61-33a6c748c3eb', '76d4be91-ba6d-58cb-93aa-502b20b26bc3'),
-- check start-a1-schule german_linguistic id=93a60b64-9ab6-5515-a7d6-36ca2dbbc754 idem=976a6bfd-55e2-51ac-8bb6-7769fc3d7c5a
  ('start-a1-schule', 'german_linguistic', '93a60b64-9ab6-5515-a7d6-36ca2dbbc754', '976a6bfd-55e2-51ac-8bb6-7769fc3d7c5a'),
-- check start-a1-schule persian_translation id=e3a2a37b-eeb9-53b9-b384-142e0c22afdd idem=0a0e2127-d734-51f0-96e1-7d70080a5812
  ('start-a1-schule', 'persian_translation', 'e3a2a37b-eeb9-53b9-b384-142e0c22afdd', '0a0e2127-d734-51f0-96e1-7d70080a5812'),
-- check start-a1-schule provenance id=e709cc6d-ed98-54cd-93b7-73785aedce9d idem=36eaee67-9a09-5c51-b0a6-e73609dc6539
  ('start-a1-schule', 'provenance', 'e709cc6d-ed98-54cd-93b7-73785aedce9d', '36eaee67-9a09-5c51-b0a6-e73609dc6539'),
-- check start-a1-schule visual id=ce4846f9-d495-547f-a68a-1a5274df4bde idem=f800e3da-0047-5ecc-96fc-2c14f1b27ff8
  ('start-a1-schule', 'visual', 'ce4846f9-d495-547f-a68a-1a5274df4bde', 'f800e3da-0047-5ecc-96fc-2c14f1b27ff8'),
-- check start-a1-schule audio id=ea1449b3-2400-5bef-8fda-26227c1adff7 idem=300462e5-f970-5e91-80fb-c8353c94eb4f
  ('start-a1-schule', 'audio', 'ea1449b3-2400-5bef-8fda-26227c1adff7', '300462e5-f970-5e91-80fb-c8353c94eb4f'),
-- check start-a1-schule app_flow id=5964ca2e-77b0-5f65-8050-b2d7a79d3ef5 idem=bd4ffc21-6ded-58b7-a329-542cc0a87946
  ('start-a1-schule', 'app_flow', '5964ca2e-77b0-5f65-8050-b2d7a79d3ef5', 'bd4ffc21-6ded-58b7-a329-542cc0a87946'),
-- check start-a1-stadt german_linguistic id=1831193b-d86e-5668-9003-9c7d590b0c36 idem=af4292a1-6d91-53f3-9b50-9bf077fb60b6
  ('start-a1-stadt', 'german_linguistic', '1831193b-d86e-5668-9003-9c7d590b0c36', 'af4292a1-6d91-53f3-9b50-9bf077fb60b6'),
-- check start-a1-stadt persian_translation id=c6d56959-b934-556c-a6ec-22ef696bb1df idem=5fa31e30-ccde-582f-8edd-1ef2e14fd878
  ('start-a1-stadt', 'persian_translation', 'c6d56959-b934-556c-a6ec-22ef696bb1df', '5fa31e30-ccde-582f-8edd-1ef2e14fd878'),
-- check start-a1-stadt provenance id=3086ec25-ea0b-5088-a799-900f97d593c8 idem=b38621e6-0bf0-51ae-b81f-c2fb8c55b3a4
  ('start-a1-stadt', 'provenance', '3086ec25-ea0b-5088-a799-900f97d593c8', 'b38621e6-0bf0-51ae-b81f-c2fb8c55b3a4'),
-- check start-a1-stadt visual id=0cc84662-61c0-547e-ae93-4aa035243a9c idem=23df8c0a-5e94-5fd2-a325-8e88488bbc5b
  ('start-a1-stadt', 'visual', '0cc84662-61c0-547e-ae93-4aa035243a9c', '23df8c0a-5e94-5fd2-a325-8e88488bbc5b'),
-- check start-a1-stadt audio id=1db569bc-2046-59b2-bf34-82f74bb25a7d idem=8baebdf8-c3d2-5181-ade1-9025124043e1
  ('start-a1-stadt', 'audio', '1db569bc-2046-59b2-bf34-82f74bb25a7d', '8baebdf8-c3d2-5181-ade1-9025124043e1'),
-- check start-a1-stadt app_flow id=af98350d-dfdf-52c8-9dc0-b3ba10e02777 idem=42f6b31a-154c-5c51-b635-d65ccc0edf61
  ('start-a1-stadt', 'app_flow', 'af98350d-dfdf-52c8-9dc0-b3ba10e02777', '42f6b31a-154c-5c51-b635-d65ccc0edf61'),
-- check start-a1-supermarkt german_linguistic id=e36a8560-1697-5267-9576-cad110c7f3c6 idem=5f2d0e8b-b427-5bfb-8a08-293f9d829229
  ('start-a1-supermarkt', 'german_linguistic', 'e36a8560-1697-5267-9576-cad110c7f3c6', '5f2d0e8b-b427-5bfb-8a08-293f9d829229'),
-- check start-a1-supermarkt persian_translation id=73ee876b-4c33-5c1c-afac-e32d27d0aabf idem=0773baba-d6da-55c8-99df-cb246863d33a
  ('start-a1-supermarkt', 'persian_translation', '73ee876b-4c33-5c1c-afac-e32d27d0aabf', '0773baba-d6da-55c8-99df-cb246863d33a'),
-- check start-a1-supermarkt provenance id=4e3be2b1-ed9e-5e40-8d45-bb1eb808f854 idem=50c2f4c3-be25-5df8-9bf4-775922bc3d25
  ('start-a1-supermarkt', 'provenance', '4e3be2b1-ed9e-5e40-8d45-bb1eb808f854', '50c2f4c3-be25-5df8-9bf4-775922bc3d25'),
-- check start-a1-supermarkt visual id=8d286d29-0215-5fed-90fb-15842303c61a idem=9708feac-c9b1-5cd3-b044-9aa2d3c6957b
  ('start-a1-supermarkt', 'visual', '8d286d29-0215-5fed-90fb-15842303c61a', '9708feac-c9b1-5cd3-b044-9aa2d3c6957b'),
-- check start-a1-supermarkt audio id=5c7a8a52-783f-51a6-b478-4de2cb934460 idem=192631f8-2f08-50c8-8fb5-6652e1d1ddbd
  ('start-a1-supermarkt', 'audio', '5c7a8a52-783f-51a6-b478-4de2cb934460', '192631f8-2f08-50c8-8fb5-6652e1d1ddbd'),
-- check start-a1-supermarkt app_flow id=b5f92a48-7f06-5bfa-b665-67e49cdb1644 idem=734ccb28-f6ba-54b2-835c-39a228d86d2c
  ('start-a1-supermarkt', 'app_flow', 'b5f92a48-7f06-5bfa-b665-67e49cdb1644', '734ccb28-f6ba-54b2-835c-39a228d86d2c'),
-- check start-a1-tee german_linguistic id=29101d21-8dd3-5ae0-aba6-098f633ebe10 idem=1e17f4bc-4b57-5cc0-8719-665632a5da8f
  ('start-a1-tee', 'german_linguistic', '29101d21-8dd3-5ae0-aba6-098f633ebe10', '1e17f4bc-4b57-5cc0-8719-665632a5da8f'),
-- check start-a1-tee persian_translation id=fa37a427-a1e3-58bc-ad4d-3a3245e8445b idem=8f338c80-768d-5175-9cb9-ff142f096ce9
  ('start-a1-tee', 'persian_translation', 'fa37a427-a1e3-58bc-ad4d-3a3245e8445b', '8f338c80-768d-5175-9cb9-ff142f096ce9'),
-- check start-a1-tee provenance id=29fdf46d-3293-579c-81ff-394148d2b3c2 idem=3ea5926a-d0f6-5618-af69-f4b292988297
  ('start-a1-tee', 'provenance', '29fdf46d-3293-579c-81ff-394148d2b3c2', '3ea5926a-d0f6-5618-af69-f4b292988297'),
-- check start-a1-tee visual id=ab5f2966-818f-5c1c-95ed-370bb757c228 idem=97c6a1f8-ea11-5d9e-a644-eed399570b2a
  ('start-a1-tee', 'visual', 'ab5f2966-818f-5c1c-95ed-370bb757c228', '97c6a1f8-ea11-5d9e-a644-eed399570b2a'),
-- check start-a1-tee audio id=f562c32a-63f1-5d3b-ab2e-f2be0e1426f7 idem=a7c1ba1f-35dc-5a89-a193-225b33929fcc
  ('start-a1-tee', 'audio', 'f562c32a-63f1-5d3b-ab2e-f2be0e1426f7', 'a7c1ba1f-35dc-5a89-a193-225b33929fcc'),
-- check start-a1-tee app_flow id=0398f0ea-567d-5edb-b9b9-caa82c179f30 idem=23dfd3da-b025-59e6-aac6-d8a0ec4b3383
  ('start-a1-tee', 'app_flow', '0398f0ea-567d-5edb-b9b9-caa82c179f30', '23dfd3da-b025-59e6-aac6-d8a0ec4b3383'),
-- check start-a1-tisch german_linguistic id=cde96897-c64d-5307-aafb-a05c1abba991 idem=087e190d-75d1-5bb5-afc1-f21db168568c
  ('start-a1-tisch', 'german_linguistic', 'cde96897-c64d-5307-aafb-a05c1abba991', '087e190d-75d1-5bb5-afc1-f21db168568c'),
-- check start-a1-tisch persian_translation id=3a9dc4dc-1f67-5417-93cd-8649832a55f6 idem=4b666e9e-5bfb-5119-a893-351d1bcb1630
  ('start-a1-tisch', 'persian_translation', '3a9dc4dc-1f67-5417-93cd-8649832a55f6', '4b666e9e-5bfb-5119-a893-351d1bcb1630'),
-- check start-a1-tisch provenance id=27bdb9b2-b535-5348-becb-4c6841faf87a idem=6b32c1c9-7ab5-50d5-abb4-9c2d6e955b50
  ('start-a1-tisch', 'provenance', '27bdb9b2-b535-5348-becb-4c6841faf87a', '6b32c1c9-7ab5-50d5-abb4-9c2d6e955b50'),
-- check start-a1-tisch visual id=af722716-a1c7-53c8-b341-7e8891c01d99 idem=7b971e78-2c86-5558-99aa-e21d8dc98509
  ('start-a1-tisch', 'visual', 'af722716-a1c7-53c8-b341-7e8891c01d99', '7b971e78-2c86-5558-99aa-e21d8dc98509'),
-- check start-a1-tisch audio id=0368028e-fb65-5c4e-a4c6-1b89752aac1d idem=0f4a6bee-769a-5277-9634-78ef4288807a
  ('start-a1-tisch', 'audio', '0368028e-fb65-5c4e-a4c6-1b89752aac1d', '0f4a6bee-769a-5277-9634-78ef4288807a'),
-- check start-a1-tisch app_flow id=a8785338-1e28-57e6-93cd-d645b4ce2e62 idem=d6b1d300-da1c-5ddf-8490-b2bf21e3a021
  ('start-a1-tisch', 'app_flow', 'a8785338-1e28-57e6-93cd-d645b4ce2e62', 'd6b1d300-da1c-5ddf-8490-b2bf21e3a021'),
-- check start-a1-trinken german_linguistic id=74ed749f-6f07-524e-990f-ac756373dae8 idem=1dcd68fa-b722-556b-acaa-3be20f883340
  ('start-a1-trinken', 'german_linguistic', '74ed749f-6f07-524e-990f-ac756373dae8', '1dcd68fa-b722-556b-acaa-3be20f883340'),
-- check start-a1-trinken persian_translation id=a15a383f-eb01-5d46-b9e4-849a103d2bbf idem=ff62be7d-07bc-58af-853a-89809086ab64
  ('start-a1-trinken', 'persian_translation', 'a15a383f-eb01-5d46-b9e4-849a103d2bbf', 'ff62be7d-07bc-58af-853a-89809086ab64'),
-- check start-a1-trinken provenance id=96fd5353-e973-5408-8270-09dcbc428367 idem=6cc1f9c6-c317-5e43-a772-583acb242ccf
  ('start-a1-trinken', 'provenance', '96fd5353-e973-5408-8270-09dcbc428367', '6cc1f9c6-c317-5e43-a772-583acb242ccf'),
-- check start-a1-trinken visual id=429e6408-0bea-59da-af67-12d2b0d2b461 idem=e3d4426c-a395-5a19-975b-7827494690d2
  ('start-a1-trinken', 'visual', '429e6408-0bea-59da-af67-12d2b0d2b461', 'e3d4426c-a395-5a19-975b-7827494690d2'),
-- check start-a1-trinken audio id=22df28b2-23e2-5364-a1df-ea343a13ee17 idem=ea5a3e95-cbcd-53dc-8664-6a0593342eff
  ('start-a1-trinken', 'audio', '22df28b2-23e2-5364-a1df-ea343a13ee17', 'ea5a3e95-cbcd-53dc-8664-6a0593342eff'),
-- check start-a1-trinken app_flow id=5eb04e3a-7337-5850-afae-92aef9ef957f idem=390b83be-29a5-56dc-aa62-03f9e21c4cb9
  ('start-a1-trinken', 'app_flow', '5eb04e3a-7337-5850-afae-92aef9ef957f', '390b83be-29a5-56dc-aa62-03f9e21c4cb9'),
-- check start-a1-tuer german_linguistic id=bbeb570b-f0ee-5fe6-aeb3-78de397673ed idem=ea70dbd4-ab9e-59bb-86a6-011ba92502b4
  ('start-a1-tuer', 'german_linguistic', 'bbeb570b-f0ee-5fe6-aeb3-78de397673ed', 'ea70dbd4-ab9e-59bb-86a6-011ba92502b4'),
-- check start-a1-tuer persian_translation id=311d0780-81d6-5f8c-b573-590525a46f59 idem=f2ed9e95-c09b-5a7a-b9f3-e8fa387bf45f
  ('start-a1-tuer', 'persian_translation', '311d0780-81d6-5f8c-b573-590525a46f59', 'f2ed9e95-c09b-5a7a-b9f3-e8fa387bf45f'),
-- check start-a1-tuer provenance id=8e7c9484-bb17-5074-a7a2-a2f7f6966130 idem=c85b4a42-b0a0-5318-b11c-cfabf641a2c1
  ('start-a1-tuer', 'provenance', '8e7c9484-bb17-5074-a7a2-a2f7f6966130', 'c85b4a42-b0a0-5318-b11c-cfabf641a2c1'),
-- check start-a1-tuer visual id=661e1537-1488-5f66-a6ec-e55bebc44e78 idem=9a7e8e50-e4a9-581c-83ca-8d082dcc0d77
  ('start-a1-tuer', 'visual', '661e1537-1488-5f66-a6ec-e55bebc44e78', '9a7e8e50-e4a9-581c-83ca-8d082dcc0d77'),
-- check start-a1-tuer audio id=a60ad79c-14b0-52fc-856b-c07130560205 idem=ffe24e66-9fa4-510c-a50e-aea8b4c84f64
  ('start-a1-tuer', 'audio', 'a60ad79c-14b0-52fc-856b-c07130560205', 'ffe24e66-9fa4-510c-a50e-aea8b4c84f64'),
-- check start-a1-tuer app_flow id=dc3290ef-1dde-58a1-bc6c-0c140a0ec06b idem=07b854aa-09a8-5048-8e98-aa8bf74d919a
  ('start-a1-tuer', 'app_flow', 'dc3290ef-1dde-58a1-bc6c-0c140a0ec06b', '07b854aa-09a8-5048-8e98-aa8bf74d919a'),
-- check start-a1-uhr german_linguistic id=7ad831ea-b090-5247-a05c-e1529b022d49 idem=e6510956-f5f9-5675-b567-47d3942e8ebd
  ('start-a1-uhr', 'german_linguistic', '7ad831ea-b090-5247-a05c-e1529b022d49', 'e6510956-f5f9-5675-b567-47d3942e8ebd'),
-- check start-a1-uhr persian_translation id=0754262b-e8fd-573c-a46a-06b7a1332088 idem=f3985b1b-fc83-5114-ac59-dbc9a13579b1
  ('start-a1-uhr', 'persian_translation', '0754262b-e8fd-573c-a46a-06b7a1332088', 'f3985b1b-fc83-5114-ac59-dbc9a13579b1'),
-- check start-a1-uhr provenance id=d52fc314-3f5d-5faf-bd20-4c2e3a797dc8 idem=5c72ee79-ad42-5438-aa77-5d88a67641d3
  ('start-a1-uhr', 'provenance', 'd52fc314-3f5d-5faf-bd20-4c2e3a797dc8', '5c72ee79-ad42-5438-aa77-5d88a67641d3'),
-- check start-a1-uhr visual id=7fb81a65-824a-54d1-a68b-5434acace7ca idem=1c60e8c3-01b1-5a37-8597-512b6870d71f
  ('start-a1-uhr', 'visual', '7fb81a65-824a-54d1-a68b-5434acace7ca', '1c60e8c3-01b1-5a37-8597-512b6870d71f'),
-- check start-a1-uhr audio id=b5ec92fe-6c75-5f51-8e5a-0a87d124a05a idem=fab89a0d-3cb8-57dc-ad60-3b642227b34e
  ('start-a1-uhr', 'audio', 'b5ec92fe-6c75-5f51-8e5a-0a87d124a05a', 'fab89a0d-3cb8-57dc-ad60-3b642227b34e'),
-- check start-a1-uhr app_flow id=7b6b1e95-53fe-5360-98df-6b35eea8b068 idem=eed763b8-18bf-567f-b1a7-0a42890f1ea4
  ('start-a1-uhr', 'app_flow', '7b6b1e95-53fe-5360-98df-6b35eea8b068', 'eed763b8-18bf-567f-b1a7-0a42890f1ea4'),
-- check start-a1-warten german_linguistic id=c4cdab21-e7af-513a-b0a3-f54643974009 idem=910ff896-a106-514c-a239-5a59f70020ca
  ('start-a1-warten', 'german_linguistic', 'c4cdab21-e7af-513a-b0a3-f54643974009', '910ff896-a106-514c-a239-5a59f70020ca'),
-- check start-a1-warten persian_translation id=9c057279-392d-5205-a36c-0e85e2bacbd7 idem=018d43f7-86f6-50b4-a7c9-d82fe58c4b9a
  ('start-a1-warten', 'persian_translation', '9c057279-392d-5205-a36c-0e85e2bacbd7', '018d43f7-86f6-50b4-a7c9-d82fe58c4b9a'),
-- check start-a1-warten provenance id=c007d869-1370-5390-afc7-ad3e54b32e85 idem=15cab389-4a77-5d44-aef5-394f21fa749d
  ('start-a1-warten', 'provenance', 'c007d869-1370-5390-afc7-ad3e54b32e85', '15cab389-4a77-5d44-aef5-394f21fa749d'),
-- check start-a1-warten visual id=ff991be7-c767-51ff-958c-a10ad6b54da1 idem=8b34b5cd-f9d9-5da9-a9e4-48524c9629a3
  ('start-a1-warten', 'visual', 'ff991be7-c767-51ff-958c-a10ad6b54da1', '8b34b5cd-f9d9-5da9-a9e4-48524c9629a3'),
-- check start-a1-warten audio id=6d70bf2a-ac36-5f5c-be37-e47233a00383 idem=bd837261-ee91-5628-afc9-53dd2f12ff0a
  ('start-a1-warten', 'audio', '6d70bf2a-ac36-5f5c-be37-e47233a00383', 'bd837261-ee91-5628-afc9-53dd2f12ff0a'),
-- check start-a1-warten app_flow id=30dff7fb-b3dc-56ff-8fce-a48f9451a832 idem=0712b934-194f-527c-b7b3-29d43d03984e
  ('start-a1-warten', 'app_flow', '30dff7fb-b3dc-56ff-8fce-a48f9451a832', '0712b934-194f-527c-b7b3-29d43d03984e'),
-- check start-a1-wasser german_linguistic id=0674a506-e8e5-5e11-9793-53474794f7de idem=92232bb2-4df5-516b-9414-8266a5ce6f3c
  ('start-a1-wasser', 'german_linguistic', '0674a506-e8e5-5e11-9793-53474794f7de', '92232bb2-4df5-516b-9414-8266a5ce6f3c'),
-- check start-a1-wasser persian_translation id=09791181-3ccf-5dd5-a473-430c95a15b48 idem=8614a693-0e6b-508c-809e-1fb6b35e900f
  ('start-a1-wasser', 'persian_translation', '09791181-3ccf-5dd5-a473-430c95a15b48', '8614a693-0e6b-508c-809e-1fb6b35e900f'),
-- check start-a1-wasser provenance id=359675ec-ddbe-58e0-91fa-7ddb26af0854 idem=17365557-93e5-5b8a-aa5c-ed5231b85e9a
  ('start-a1-wasser', 'provenance', '359675ec-ddbe-58e0-91fa-7ddb26af0854', '17365557-93e5-5b8a-aa5c-ed5231b85e9a'),
-- check start-a1-wasser visual id=53db115e-6993-5390-a371-791770ad4182 idem=ce407a9a-527e-5ddf-9064-e65a24dd1dca
  ('start-a1-wasser', 'visual', '53db115e-6993-5390-a371-791770ad4182', 'ce407a9a-527e-5ddf-9064-e65a24dd1dca'),
-- check start-a1-wasser audio id=f681f4c5-77c8-5a32-a6ae-c2faa07b8c1c idem=3941e149-97a2-53ca-b7ba-8a5c29c8654f
  ('start-a1-wasser', 'audio', 'f681f4c5-77c8-5a32-a6ae-c2faa07b8c1c', '3941e149-97a2-53ca-b7ba-8a5c29c8654f'),
-- check start-a1-wasser app_flow id=ebdf2c0f-74fd-5cc0-a9ca-95e3c63ce95a idem=ee8b6780-df90-55f0-89df-9a5b8aa91f5a
  ('start-a1-wasser', 'app_flow', 'ebdf2c0f-74fd-5cc0-a9ca-95e3c63ce95a', 'ee8b6780-df90-55f0-89df-9a5b8aa91f5a'),
-- check start-a1-wie-geht-es-ihnen german_linguistic id=e6db2a40-6ae3-5fd4-ae87-4bc39d41340c idem=a446cdf7-3a88-5163-9160-c3dd51c4ae1b
  ('start-a1-wie-geht-es-ihnen', 'german_linguistic', 'e6db2a40-6ae3-5fd4-ae87-4bc39d41340c', 'a446cdf7-3a88-5163-9160-c3dd51c4ae1b'),
-- check start-a1-wie-geht-es-ihnen persian_translation id=513e991e-8f64-5f30-8bb7-cbb1cdb25cdf idem=5ca424de-e096-55c6-8988-958134ddfc44
  ('start-a1-wie-geht-es-ihnen', 'persian_translation', '513e991e-8f64-5f30-8bb7-cbb1cdb25cdf', '5ca424de-e096-55c6-8988-958134ddfc44'),
-- check start-a1-wie-geht-es-ihnen provenance id=f0b466e8-82b2-59fd-acfd-040d22667235 idem=f5a7eae8-2e5c-535a-b515-c259b09a3cf7
  ('start-a1-wie-geht-es-ihnen', 'provenance', 'f0b466e8-82b2-59fd-acfd-040d22667235', 'f5a7eae8-2e5c-535a-b515-c259b09a3cf7'),
-- check start-a1-wie-geht-es-ihnen visual id=91641566-76a4-5dbf-bbc1-f2f4ba04f8af idem=3481ba30-84c2-51a5-84f4-4f957c187d8b
  ('start-a1-wie-geht-es-ihnen', 'visual', '91641566-76a4-5dbf-bbc1-f2f4ba04f8af', '3481ba30-84c2-51a5-84f4-4f957c187d8b'),
-- check start-a1-wie-geht-es-ihnen audio id=1c09b856-8e97-5a7f-8fc0-c4406d3e0bca idem=8ad71490-b603-545a-bc61-ad0536600941
  ('start-a1-wie-geht-es-ihnen', 'audio', '1c09b856-8e97-5a7f-8fc0-c4406d3e0bca', '8ad71490-b603-545a-bc61-ad0536600941'),
-- check start-a1-wie-geht-es-ihnen app_flow id=40c17b40-8dc6-5322-9dd5-ee06d616b846 idem=45321a48-573d-56cf-a795-31c360019341
  ('start-a1-wie-geht-es-ihnen', 'app_flow', '40c17b40-8dc6-5322-9dd5-ee06d616b846', '45321a48-573d-56cf-a795-31c360019341'),
-- check start-a1-wohnen german_linguistic id=2d0f917d-8a66-5812-8ebd-5b136f00e41f idem=c0e7b813-a617-545d-9468-60461d6c0597
  ('start-a1-wohnen', 'german_linguistic', '2d0f917d-8a66-5812-8ebd-5b136f00e41f', 'c0e7b813-a617-545d-9468-60461d6c0597'),
-- check start-a1-wohnen persian_translation id=f8a6b441-16f0-5aaf-bcae-aba5ab571f09 idem=c4dbd299-9ab7-556f-9c88-612e47f2fb8a
  ('start-a1-wohnen', 'persian_translation', 'f8a6b441-16f0-5aaf-bcae-aba5ab571f09', 'c4dbd299-9ab7-556f-9c88-612e47f2fb8a'),
-- check start-a1-wohnen provenance id=47f54fb9-fc1c-59b0-b0cb-da229ee629d2 idem=3a413580-1cdb-5834-9aab-73a03a924a9c
  ('start-a1-wohnen', 'provenance', '47f54fb9-fc1c-59b0-b0cb-da229ee629d2', '3a413580-1cdb-5834-9aab-73a03a924a9c'),
-- check start-a1-wohnen visual id=b1dd8035-3107-59f0-a238-042373766fe1 idem=e22047e2-ad91-503c-b816-7b257df32ca7
  ('start-a1-wohnen', 'visual', 'b1dd8035-3107-59f0-a238-042373766fe1', 'e22047e2-ad91-503c-b816-7b257df32ca7'),
-- check start-a1-wohnen audio id=6cbd1c37-48e6-5f59-bd39-89184711c77c idem=cdaae93f-791b-5571-98b6-8ab366b29fa2
  ('start-a1-wohnen', 'audio', '6cbd1c37-48e6-5f59-bd39-89184711c77c', 'cdaae93f-791b-5571-98b6-8ab366b29fa2'),
-- check start-a1-wohnen app_flow id=62ff4289-0db1-52aa-a401-06db064107a8 idem=a83e0e5d-8c4c-511c-86a2-e99a2a2f559b
  ('start-a1-wohnen', 'app_flow', '62ff4289-0db1-52aa-a401-06db064107a8', 'a83e0e5d-8c4c-511c-86a2-e99a2a2f559b'),
-- check start-a1-zimmer german_linguistic id=efb6f3d8-4ede-506e-903c-82ceaa7d47b3 idem=d40a182a-4d5a-562e-a5ef-b3847f4abf47
  ('start-a1-zimmer', 'german_linguistic', 'efb6f3d8-4ede-506e-903c-82ceaa7d47b3', 'd40a182a-4d5a-562e-a5ef-b3847f4abf47'),
-- check start-a1-zimmer persian_translation id=53bc9c27-d4b5-52cf-9a4b-6712f0b0e40a idem=e40f20a4-2063-5cd9-b236-95f021eb654a
  ('start-a1-zimmer', 'persian_translation', '53bc9c27-d4b5-52cf-9a4b-6712f0b0e40a', 'e40f20a4-2063-5cd9-b236-95f021eb654a'),
-- check start-a1-zimmer provenance id=6167ffe8-ffcb-59ed-882d-4afc414d3be7 idem=a72f896d-504f-582a-8d1f-8c7c31a72be8
  ('start-a1-zimmer', 'provenance', '6167ffe8-ffcb-59ed-882d-4afc414d3be7', 'a72f896d-504f-582a-8d1f-8c7c31a72be8'),
-- check start-a1-zimmer visual id=206e50af-15db-5fae-8431-28adfa12213a idem=b4ba1888-ea28-5839-b3b8-fd1a6623fa46
  ('start-a1-zimmer', 'visual', '206e50af-15db-5fae-8431-28adfa12213a', 'b4ba1888-ea28-5839-b3b8-fd1a6623fa46'),
-- check start-a1-zimmer audio id=840e2520-4d68-5fbf-a23e-b4f5d1c838b3 idem=c8758eb0-1e06-50a4-86e4-8af2f1fc66ea
  ('start-a1-zimmer', 'audio', '840e2520-4d68-5fbf-a23e-b4f5d1c838b3', 'c8758eb0-1e06-50a4-86e4-8af2f1fc66ea'),
-- check start-a1-zimmer app_flow id=ad1f3bc1-86fc-5472-bf81-39dcacd8bcd3 idem=acdec8b4-3e19-575e-8ab6-db7081e65b6b
  ('start-a1-zimmer', 'app_flow', 'ad1f3bc1-86fc-5472-bf81-39dcacd8bcd3', 'acdec8b4-3e19-575e-8ab6-db7081e65b6b');

DO $$
DECLARE
  expected RECORD;
BEGIN
  FOR expected IN
    SELECT c.content_id, c.version_id, d.dimension, d.check_id, d.check_key
      FROM _lbds049_checks d
      JOIN _lbds049_candidates c USING (content_id)
     ORDER BY d.content_id, d.dimension
  LOOP
    IF EXISTS (
      SELECT 1
        FROM content_review_checks rc
       WHERE rc.card_version_id = expected.version_id
         AND rc.dimension = expected.dimension::content_review_dimension
         AND (rc.id IS DISTINCT FROM expected.check_id
              OR rc.check_key IS DISTINCT FROM expected.check_key
              OR rc.outcome IS DISTINCT FROM 'pending'
              OR rc.reviewer_user_id IS NOT NULL
              OR rc.reviewed_at IS NOT NULL
              OR rc.idempotency_key IS NOT NULL)
    ) THEN
      RAISE EXCEPTION '0017 fail-closed: review check for % dimension % diverges from pending baseline', expected.content_id, expected.dimension;
    END IF;
  END LOOP;
END $$;

INSERT INTO content_review_checks (id, card_version_id, dimension, outcome, check_key)
SELECT d.check_id, c.version_id, d.dimension::content_review_dimension, 'pending', d.check_key
  FROM _lbds049_checks d
  JOIN _lbds049_candidates c USING (content_id)
 WHERE NOT EXISTS (
   SELECT 1
     FROM content_review_checks rc
    WHERE rc.card_version_id = c.version_id
      AND rc.dimension = d.dimension::content_review_dimension
 );

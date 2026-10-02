-- Replace the made-up YouTube links in the live "videos" table with real, embeddable videos about Laos
-- (all four verified with YouTube's oEmbed API on 2026-10-02), and add the Baci ceremony video.
-- Only rows whose link is still one of the old made-up IDs are changed; videos you edited yourself are left alone.
-- Run in the Supabase SQL Editor, then open the Admin and click "Publish now".

begin;

update public.videos set data = data || $ll${"embedUrl":"https://www.youtube.com/embed/j7TToA_jaMg","title":{"en":"Learn to Read and Speak Lao: Greetings","lo":"ຮຽນອ່ານ ແລະ ເວົ້າພາສາລາວ: ຄຳທັກທາຍ","zh":"学读说老挝语：问候语"},"desc":{"en":"A short lesson on everyday Lao greetings (vaolao channel). Practise the phrases below after watching.","lo":"ບົດຮຽນສັ້ນໆກ່ຽວກັບຄຳທັກທາຍພາສາລາວໃນຊີວິດປະຈຳວັນ. ຝຶກປະໂຫຍກຂ້າງລຸ່ມນີ້ຫຼັງຈາກເບິ່ງ."}}$ll$::jsonb, updated_at = now()
 where id = $ll$v01-greetings$ll$ and (coalesce(data->>'embedUrl','') = '' or data->>'embedUrl' like '%fW_7e93H2_Y%' or data->>'embedUrl' like '%5a4x3w8k9fA%' or data->>'embedUrl' like '%3v7X8k0w4mE%' or data->>'embedUrl' like '%9bX8m4k01vP%');

update public.videos set data = data || $ll${"embedUrl":"https://www.youtube.com/embed/L3sLXhhtwK0","title":{"en":"Vientiane Night Market: Street Food at Sihom","lo":"ຕະຫຼາດກາງຄືນວຽງຈັນ: ອາຫານຢູ່ສີຫອມ","zh":"万象夜市：西洪街头美食"},"desc":{"en":"A walk through the Sihom night market in Vientiane (Lao Ocean channel). Use the phrases below to order food and ask prices.","lo":"ຍ່າງຊົມຕະຫຼາດກາງຄືນສີຫອມ ນະຄອນຫຼວງວຽງຈັນ. ໃຊ້ປະໂຫຍກຂ້າງລຸ່ມນີ້ເພື່ອສັ່ງອາຫານ ແລະ ຖາມລາຄາ."}}$ll$::jsonb, updated_at = now()
 where id = $ll$v02-vientiane-market$ll$ and (coalesce(data->>'embedUrl','') = '' or data->>'embedUrl' like '%fW_7e93H2_Y%' or data->>'embedUrl' like '%5a4x3w8k9fA%' or data->>'embedUrl' like '%3v7X8k0w4mE%' or data->>'embedUrl' like '%9bX8m4k01vP%');

update public.videos set data = data || $ll${"embedUrl":"https://www.youtube.com/embed/DSuQu7yWirU","title":{"en":"Learn to Read and Speak Lao: Tones","lo":"ຮຽນອ່ານ ແລະ ເວົ້າພາສາລາວ: ວັນນະຍຸດ","zh":"学读说老挝语：声调"},"desc":{"en":"An introduction to Lao as a tonal language (vaolao channel).","lo":"ແນະນຳພາສາລາວໃນຖານະພາສາທີ່ມີວັນນະຍຸດ."}}$ll$::jsonb, updated_at = now()
 where id = $ll$v03-tone-mastery$ll$ and (coalesce(data->>'embedUrl','') = '' or data->>'embedUrl' like '%fW_7e93H2_Y%' or data->>'embedUrl' like '%5a4x3w8k9fA%' or data->>'embedUrl' like '%3v7X8k0w4mE%' or data->>'embedUrl' like '%9bX8m4k01vP%');

update public.videos set data = data || $ll${"embedUrl":"https://www.youtube.com/embed/ZABBTXMXfAI","title":{"en":"The Baci (Sou Khuan) Ceremony","lo":"ພິທີບາສີສູ່ຂວັນ","zh":"老挝传统拴线祈福仪式 (Baci)"},"desc":{"en":"UNESCO ICHCAP documentary on the Baci-Soukhouane ceremony, where white strings are tied on the wrist as a blessing.","lo":"ສາລະຄະດີຂອງ UNESCO ICHCAP ກ່ຽວກັບພິທີບາສີສູ່ຂວັນ ແລະ ການຜູກແຂນເອົາພອນ."}}$ll$::jsonb, updated_at = now()
 where id = $ll$v04-baci-ceremony$ll$ and (coalesce(data->>'embedUrl','') = '' or data->>'embedUrl' like '%fW_7e93H2_Y%' or data->>'embedUrl' like '%5a4x3w8k9fA%' or data->>'embedUrl' like '%3v7X8k0w4mE%' or data->>'embedUrl' like '%9bX8m4k01vP%');
insert into public.videos (id, data) values ($ll$v04-baci-ceremony$ll$, $ll${"status":"published","access":"free","level":3,"title":{"en":"The Baci (Sou Khuan) Ceremony","lo":"ພິທີບາສີສູ່ຂວັນ","zh":"老挝传统拴线祈福仪式 (Baci)"},"category":"culture","difficulty":"Stage 3 · Conversational","embedUrl":"https://www.youtube.com/embed/ZABBTXMXfAI","desc":{"en":"UNESCO ICHCAP documentary on the Baci-Soukhouane ceremony, where white strings are tied on the wrist as a blessing.","lo":"ສາລະຄະດີຂອງ UNESCO ICHCAP ກ່ຽວກັບພິທີບາສີສູ່ຂວັນ ແລະ ການຜູກແຂນເອົາພອນ."},"transcript":[{"sp":"Elder","lo":"ມານີ້ເດີ້ລູກຫຼານ, ມາຜູກແຂນເອົາພອນໄຊ.","rom":"maa nîi dêe lûuk-lǎan, maa phùuk-khɛ̌ɛn ao phɔɔn-sái.","en":"Come here children, let us tie the white threads and receive blessings."},{"sp":"Guest","lo":"ສາທຸ! ຂໍໃຫ້ມີສຸຂະພາບແຂງແຮງ, ໂຊກດີຕະຫຼອດໄປ.","rom":"sǎa-thú! khɔ̌ɔ hài mii sú-kha-phâap khɛ̌ɛng-hɛ́ɛng, sôok-dīi dtā-lɔ̀ɔt pái.","en":"Satu! May we be blessed with great health and continuous good fortune."}],"vocab":[{"lo":"ບາສີສູ່ຂວັນ","rom":"baa-sǐi sùu-khwǎn","en":"Baci spirit-calling ceremony"},{"lo":"ຜູກແຂນ","rom":"phùuk-khɛ̌ɛn","en":"to tie cotton thread on wrist"},{"lo":"ພອນໄຊ","rom":"phɔɔn-sái","en":"sacred blessings"},{"lo":"ສາທຸ","rom":"sǎa-thú","en":"amen / solemn affirmation"}],"version":1,"createdAt":1790932744442,"updatedAt":1790932744442,"createdBy":"seed","updatedBy":"seed"}$ll$::jsonb) on conflict (id) do nothing;

-- Mark the published package as out of date so the Admin shows "Publish now"
insert into public.settings (id, data) values ('bundle', '{"dirty": true}'::jsonb)
  on conflict (id) do update set data = public.settings.data || '{"dirty": true}'::jsonb, updated_at = now();

commit;

-- Check: every video should now have a real link
select id, data->>'embedUrl' as link, data->'title'->>'en' as title from public.videos order by id;

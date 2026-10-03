-- Repairs the starter content in the live database (same changes as data/seed.json):
--   * lessons that point to patterns / grammar / a quiz that do not exist now point to existing ones
--   * the three "lao1" lessons get their patterns, grammar, dialogues, quizzes and vocabulary
--   * the "Lao for Beginners" path gets its lesson steps (it used an older format the app does not read)
-- A row is changed only if it still has the original (broken or empty) value, so your own edits are kept.
-- Run in the Supabase SQL Editor, then open the Admin and click "Publish now".

begin;

update public.lessons set data = data || $ll${"patterns":[3,1],"grammar":["g03-politeness"],"dialogues":[],"quizzes":["q-greetings"],"vocab":["ສະບາຍດີ","ຂອບໃຈ","ບໍ່ເປັນຫຍັງ","ເຈົ້າ","ຂ້ອຍ","ຊື່"]}$ll$::jsonb, updated_at = now()
 where id = $ll$lao1-greetings$ll$ and coalesce(jsonb_array_length(data->'patterns'),0) = 0 and coalesce(jsonb_array_length(data->'quizzes'),0) = 0;

update public.lessons set data = data || $ll${"patterns":[4,2],"grammar":["g01-word-order"],"dialogues":["d01-restaurant","d-coffee"],"quizzes":["q-food"],"vocab":["ກິນ","ເຂົ້າໜຽວ","ລາບ","ຕຳໝາກຫຸ່ງ","ແຊບ","ກາເຟ"]}$ll$::jsonb, updated_at = now()
 where id = $ll$lao1-food$ll$ and coalesce(jsonb_array_length(data->'patterns'),0) = 0 and coalesce(jsonb_array_length(data->'quizzes'),0) = 0;

update public.lessons set data = data || $ll${"patterns":[3,7],"grammar":["g02-classifiers"],"dialogues":["d02-market","d-shopping"],"quizzes":["q-market"],"vocab":["ຊື້","ລາຄາ","ເທົ່າໃດ","ແພງ","ຖືກ","ກີບ"]}$ll$::jsonb, updated_at = now()
 where id = $ll$lao1-shopping$ll$ and coalesce(jsonb_array_length(data->'patterns'),0) = 0 and coalesce(jsonb_array_length(data->'quizzes'),0) = 0;

update public.lessons set data = data || $ll${"patterns":[3,4],"grammar":["g02-classifiers"]}$ll$::jsonb, updated_at = now()
 where id = $ll$hsk2-talat$ll$ and data->'patterns' = '[11, 81]'::jsonb;

update public.lessons set data = data || $ll${"patterns":[4,2],"grammar":["g01-word-order"],"dialogues":["d-coffee","d01-restaurant"],"quizzes":["q-food"]}$ll$::jsonb, updated_at = now()
 where id = $ll$hsk2-restaurant$ll$ and data->'patterns' = '[97, 117]'::jsonb;

update public.paths set data = (data - 'itemIds') || $ll${"steps":[{"type":"lesson","id":"lao1-greetings"},{"type":"lesson","id":"lao1-food"},{"type":"lesson","id":"lao1-shopping"},{"type":"lesson","id":"hsk2-talat"},{"type":"lesson","id":"hsk2-restaurant"}]}$ll$::jsonb, updated_at = now()
 where id = 'path-beginner' and coalesce(jsonb_array_length(data->'steps'), 0) = 0;

-- mark the published package as out of date so the Admin shows "Publish now"
insert into public.settings (id, data) values ('bundle', '{"dirty": true}'::jsonb)
  on conflict (id) do update set data = public.settings.data || '{"dirty": true}'::jsonb, updated_at = now();

commit;

-- Check
select id, data->'patterns' as patterns, data->'grammar' as grammar, data->'quizzes' as quizzes from public.lessons order by id;
select id, data->'steps' as steps from public.paths;

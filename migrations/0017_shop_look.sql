-- A shop's look (src/lib/theme.ts): its colour as #rrggbb (NULL = Shopi orange), the style of its name and headings
-- (NULL = clean, Mona Sans) and a cover photo above the shop's name (an R2 key like the logo's, with a small copy).
ALTER TABLE shops ADD COLUMN theme_color TEXT;
ALTER TABLE shops ADD COLUMN theme_font TEXT;
ALTER TABLE shops ADD COLUMN cover_key TEXT;

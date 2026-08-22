# playgate

Рабочий договор агента — [`CLAUDE.md`](CLAUDE.md). Его читают Claude Code,
Cursor и любой другой агент в этом дереве.

## Две машины — обязательное, даже если больше ничего не читал

Проект живёт на двух машинах, и **эта может оказаться Mac с 8 ГБ памяти**.
Правила целиком — в `CLAUDE.md`, раздел «Проект разрабатывается с двух машин»;
их несущая часть:

- На Mac **не запускают** `npm ci`, `npm run build`, полный `npm test` и
  `next dev` — не из принципа, а по железу: своп душит и сборку, и рендер.
  Тяжёлое передаётся Windows-машине: `ssh igor@100.108.230.70 "winrun npm test"`.
- У Windows **своя рабочая копия**: незапушенная правка для неё не существует,
  и прогон по старому коду вернёт зелёный, ничего не проверив. Перед передачей —
  commit + push, на той стороне `git pull`.
- Лёгкое на Mac можно и нужно: `npm run typecheck` (8 с), `npm run test:affected`.

Полный плейбук — [`.claude/skills/parallel-work/SKILL.md`](.claude/skills/parallel-work/SKILL.md).

Плейбуки домена — [`.claude/skills/`](.claude/skills/). Они ссылаются на
`games/make-a-mess/docs/` и не пересказывают канон. Одноимённый скилл в
`~/.claude/skills` или `~/.cursor/skills` молча перекрывает репозиторный:
дубликаты в пользовательский слой не ставить.

DC-3 на полосе 09 (оси, кабина, кресло, меню после руления, створки в
полёте):
[`games/make-a-mess/docs/dc-3/runtime-lessons.md`](games/make-a-mess/docs/dc-3/runtime-lessons.md).

Длинная визуальная сессия с кадром хозяина:
[`games/make-a-mess/docs/visual-coauthoring-lessons.md`](games/make-a-mess/docs/visual-coauthoring-lessons.md)
и скилл [`.claude/skills/visual-coauthoring/`](.claude/skills/visual-coauthoring/).
После компакта чат — JSONL из системного сообщения, не summary.

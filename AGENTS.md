# playgate

Рабочий договор агента — [`CLAUDE.md`](CLAUDE.md). Его читают Claude Code,
Cursor и любой другой агент в этом дереве.

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

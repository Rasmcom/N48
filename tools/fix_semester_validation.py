from pathlib import Path

path = Path('app3.js')
text = path.read_text(encoding='utf-8')
old = "candidates.push({teacherId:t.id,capacity:assignmentCapacity(a)})"
new = "candidates.push({teacherId:t.id,capacity:semesterCapacity(a)})"
if old in text:
    path.write_text(text.replace(old, new), encoding='utf-8')
    print('Semester validation capacity patched')
else:
    print('Semester validation capacity already patched')

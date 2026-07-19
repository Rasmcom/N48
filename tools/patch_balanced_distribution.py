from pathlib import Path
import re

app_path = Path('app3.js')
app = app_path.read_text(encoding='utf-8')

# 1) Selection state for bulk teacher deletion.
if 'const selectedTeacherIds = new Set();' not in app:
    app = app.replace(
        '  let pendingWorkbook = null;\n',
        '  let pendingWorkbook = null;\n  const selectedTeacherIds = new Set();\n',
        1,
    )

# 2) Teacher list with multi-select and bulk deletion.
teacher_block = r'''  function filteredTeachers(){const q=key($('#teacherSearch')?.value||'');return q?state.teachers.filter(t=>key(`${t.name} ${t.specialty}`).includes(q)):state.teachers}
  function deleteSelectedTeachers(){
    const ids=[...selectedTeacherIds].filter(id=>state.teachers.some(t=>t.id===id));
    if(!ids.length)return toast('حدد معلمًا واحدًا على الأقل.','warning');
    const names=state.teachers.filter(t=>ids.includes(t.id)).map(t=>t.name);
    if(!confirm(`سيتم حذف ${ids.length} معلمًا وجميع إسناداتهم:\n${names.slice(0,6).join('، ')}${names.length>6?'…':''}\nهل تريد المتابعة؟`))return;
    const removed=new Set(ids);
    state.teachers=state.teachers.filter(t=>!removed.has(t.id));
    if(removed.has(state.selectedTeacherId))state.selectedTeacherId=null;
    selectedTeacherIds.clear();
    state.validation={teachers:[],sections:[]};
    state.distributions=[];
    renderTeachers();renderDashboard();renderValidation();renderDistributions();updateNav();scheduleSave();
    toast(`تم حذف ${ar(ids.length)} معلمًا وإسناداتهم`,'success')
  }
  function renderTeachers(){
    [...selectedTeacherIds].forEach(id=>{if(!state.teachers.some(t=>t.id===id))selectedTeacherIds.delete(id)});
    const list=filteredTeachers();$('#teachersListCount').textContent=ar(state.teachers.length);const root=$('#teachersList');
    if(!state.teachers.length){selectedTeacherIds.clear();root.innerHTML='<div class="empty-state"><div class="empty-icon">⇩</div><h3>لا يوجد معلمون</h3><p>استورد المعلمين أولًا.</p></div>';$('#teacherEditor').className='panel teacher-editor empty-state';$('#teacherEditor').innerHTML='<div class="empty-icon">◫</div><h3>استورد المعلمين لبدء الإسناد</h3>';return}
    const selectedCount=selectedTeacherIds.size;
    const toolbar=`<div class="teacher-bulk-toolbar"><div><strong>إدارة القائمة</strong><small>${selectedCount?`${ar(selectedCount)} معلم محدد`:'حدد أكثر من معلم للحذف الجماعي'}</small></div><div class="teacher-bulk-actions"><button type="button" class="secondary-button" data-select-visible-teachers>تحديد الظاهر</button><button type="button" class="secondary-button" data-clear-teacher-selection ${selectedCount?'':'disabled'}>إلغاء التحديد</button><button type="button" class="danger-ghost-button" data-delete-selected-teachers ${selectedCount?'':'disabled'}>حذف المحددين</button></div></div>`;
    const rows=list.length?list.map(t=>{const initials=t.name.split(' ').slice(0,2).map(x=>x[0]).join('');const load=teacherLoad(t);return`<div class="teacher-list-row ${selectedTeacherIds.has(t.id)?'bulk-selected':''}"><label class="teacher-bulk-check" title="تحديد المعلم"><input type="checkbox" data-bulk-teacher="${t.id}" ${selectedTeacherIds.has(t.id)?'checked':''}><span></span></label><button type="button" class="teacher-list-item ${state.selectedTeacherId===t.id?'active':''} ${t.excluded?'teacher-excluded':''}" data-select-teacher="${t.id}"><span class="teacher-mini-avatar">${safe(initials)}</span><span><strong>${safe(t.name)}</strong><small>${safe(t.specialty||'التخصص غير محدد')} · ${ar(load)}/${ar(t.load||0)} · ${safe(RANKS[t.rank])}</small></span><span class="teacher-status-dot ${t.excluded?'excluded':teacherComplete(t)?'complete':'warning'}"></span></button></div>`}).join(''):'<div class="empty-state compact"><h3>لا توجد نتائج مطابقة للبحث</h3></div>';
    root.innerHTML=toolbar+rows;
    if(state.selectedTeacherId&&state.teachers.some(t=>t.id===state.selectedTeacherId))renderTeacherEditor(state.selectedTeacherId);else if(list[0])selectTeacher(list[0].id)
  }
  function selectTeacher(id){state.selectedTeacherId=id;renderTeachers();scheduleSave()}
  function renderTeacherEditor'''

app, count = re.subn(
    r"  function filteredTeachers\(\).*?\n  function renderTeacherEditor",
    teacher_block,
    app,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError('Could not replace teacher list block')

# 3) Global weekly matching: the teacher is blocked only in the weeks actually assigned,
# not reserved for one section for the whole semester.
distribution_block = r'''  function distributeSemester(semester,ready,firstMap=null){
    const length=semesterWeeks();
    const teacherActivityCount=new Map();
    const teacherSectionUse=new Map();
    const firstPairs=new Map();
    if(firstMap)firstMap.forEach((item,sectionId)=>firstPairs.set(sectionId,new Set(item.summary.map(x=>`${x.teacherId}|${x.subject}`))));
    const models=allSections().filter(s=>ready.has(s.id)).map(section=>({
      section,
      candidates:semesterSourceGroups(section.id).flatMap(group=>group.assignments.map(a=>({...a,teacher:group.teacher}))),
      weeks:[],blocks:[],currentSourceId:'',currentTeacherId:'',closedSources:new Set()
    }));

    const candidateOptions=(model,usedTeachers)=>{
      const firstSet=firstPairs.get(model.section.id)||new Set();
      const byTeacher=new Map();
      model.candidates.forEach(candidate=>{
        if(candidate.remaining<=0||model.closedSources.has(candidate.id)||usedTeachers.has(candidate.teacherId))return;
        const sameSource=candidate.id===model.currentSourceId?1:0;
        const sameTeacher=candidate.teacherId===model.currentTeacherId?1:0;
        const repeatedPair=firstSet.has(`${candidate.teacherId}|${candidate.subject}`)?1:0;
        const repeatedTeacher=[...firstSet].some(pair=>pair.startsWith(`${candidate.teacherId}|`))?1:0;
        const load=Number(candidate.teacher.load||state.settings.targetLoad||24);
        const lowLoadAdvantage=Math.max(0,Number(state.settings.targetLoad||24)-load);
        const sectionSet=teacherSectionUse.get(candidate.teacherId)||new Set();
        const score=sameSource*1000000+sameTeacher*180000+Number(candidate.weeklyPeriods)*5000+(specialtyMatch(candidate.specialty,candidate.subject)?1200:0)+candidate.remaining*90+lowLoadAdvantage*150-(teacherActivityCount.get(candidate.teacherId)||0)*35-sectionSet.size*260-(semester===2?repeatedPair*50000+repeatedTeacher*12000:0);
        const existing=byTeacher.get(candidate.teacherId);
        if(!existing||score>existing.score)byTeacher.set(candidate.teacherId,{candidate,score})
      });
      return[...byTeacher.values()].sort((a,b)=>b.score-a.score)
    };

    for(let week=1;week<=length;week+=1){
      let best=[];
      let bestScore=-Infinity;
      const search=(pending,usedTeachers,chosen,totalScore)=>{
        if(chosen.length>best.length||(chosen.length===best.length&&totalScore>bestScore)){best=[...chosen];bestScore=totalScore}
        if(!pending.length)return true;
        let pickIndex=0;let pickOptions=null;
        for(let i=0;i<pending.length;i+=1){const options=candidateOptions(pending[i],usedTeachers);if(pickOptions===null||options.length<pickOptions.length){pickIndex=i;pickOptions=options;if(!options.length)break}}
        const model=pending[pickIndex];
        const rest=pending.filter((_,index)=>index!==pickIndex);
        for(const option of (pickOptions||[]).slice(0,10)){
          usedTeachers.add(option.candidate.teacherId);chosen.push({model,option});
          if(search(rest,usedTeachers,chosen,totalScore+option.score)&&best.length===models.length)return true;
          chosen.pop();usedTeachers.delete(option.candidate.teacherId)
        }
        search(rest,usedTeachers,chosen,totalScore-1000000);
        return false
      };
      search(models,new Set(),[],0);
      const selected=new Map(best.map(x=>[x.model.section.id,x.option.candidate]));
      models.forEach(model=>{
        const candidate=selected.get(model.section.id);if(!candidate)return;
        if(model.currentSourceId&&model.currentSourceId!==candidate.id)model.closedSources.add(model.currentSourceId);
        model.currentSourceId=candidate.id;model.currentTeacherId=candidate.teacherId;candidate.remaining-=1;
        const item={semester,semesterWeek:week,annualWeek:(semester-1)*length+week,teacherId:candidate.teacherId,teacherName:candidate.teacherName,specialty:candidate.specialty,subject:candidate.subject,weeklyPeriods:candidate.weeklyPeriods,capacity:candidate.capacity};
        model.weeks.push(item);
        const last=model.blocks.at(-1);
        if(last&&last.sourceId===candidate.id&&last.endWeek===week-1){last.endWeek=week;last.used+=1}else{model.blocks.push({sourceId:candidate.id,teacherId:candidate.teacherId,teacherName:candidate.teacherName,subject:candidate.subject,weeklyPeriods:candidate.weeklyPeriods,used:1,capacity:candidate.capacity,startWeek:week,endWeek:week})}
        teacherActivityCount.set(candidate.teacherId,(teacherActivityCount.get(candidate.teacherId)||0)+1);
        const set=teacherSectionUse.get(candidate.teacherId)||new Set();set.add(model.section.id);teacherSectionUse.set(candidate.teacherId,set)
      })
    }

    const result=new Map();
    models.forEach(model=>result.set(model.section.id,{semester,sectionId:model.section.id,sectionLabel:model.section.label,weeks:model.weeks,summary:model.blocks,complete:model.weeks.length===length,missing:length-model.weeks.length,mode:semester===1?'first':'different'}));
    return result
  }
  function generateDistributions'''

app, count = re.subn(
    r"  function distributeSemester\(semester,ready,firstMap=null\)\{.*?\n  function generateDistributions",
    distribution_block,
    app,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError('Could not replace semester distribution block')

# 4) Bulk-selection events in teacher list.
old_listener = "$('#teacherSearch').addEventListener('input',renderTeachers);$('#teachersList').addEventListener('click',e=>{const b=e.target.closest('[data-select-teacher]');if(b)selectTeacher(b.dataset.selectTeacher)});"
new_listener = "$('#teacherSearch').addEventListener('input',renderTeachers);$('#teachersList').addEventListener('click',e=>{const selectVisible=e.target.closest('[data-select-visible-teachers]');if(selectVisible){filteredTeachers().forEach(t=>selectedTeacherIds.add(t.id));renderTeachers();return}if(e.target.closest('[data-clear-teacher-selection]')){selectedTeacherIds.clear();renderTeachers();return}if(e.target.closest('[data-delete-selected-teachers]')){deleteSelectedTeachers();return}const check=e.target.closest('[data-bulk-teacher]');if(check){check.checked?selectedTeacherIds.add(check.dataset.bulkTeacher):selectedTeacherIds.delete(check.dataset.bulkTeacher);renderTeachers();return}const b=e.target.closest('[data-select-teacher]');if(b)selectTeacher(b.dataset.selectTeacher)});"
if old_listener not in app:
    raise RuntimeError('Could not find teacher click listener')
app = app.replace(old_listener, new_listener, 1)

# 5) More useful explanation for incomplete matching.
app = app.replace(
    'سبب النقص: لا يمكن إسناد المعلم نفسه لشعبتين في الأسبوع ذاته، والمعلم ذو النصاب الكامل يُحجز لشعبة واحدة خلال الفصل.',
    'سبب النقص: لم تتوفر مطابقة كاملة بين جميع الشعب والمعلمين في بعض الأسابيع. أضف إسناد مادة لمعلم مختلف في هذه الشعبة، أو أضف معلمًا آخر، مع بقاء منع تكرار المعلم في شعبتين خلال الأسبوع نفسه.',
)
app = app.replace(
    'يفترض النظام أن حصة النشاط في وقت موحد؛ لذلك لا يُسند المعلم إلى شعبتين في الأسبوع نفسه، ولا يُستخدم في أكثر من شعبة خلال الفصل إلا عندما يكون نصابه منخفضًا جدًا.',
    'يفترض النظام أن حصة النشاط في وقت موحد؛ لذلك لا يُسند المعلم إلى شعبتين في الأسبوع نفسه. يمكن للمعلم الانتقال بين شعب مختلفة في أسابيع مختلفة، ولا يُحجز لشعبة واحدة طوال الفصل.',
)

app_path.write_text(app, encoding='utf-8')

# 6) Styles for teacher bulk actions.
css_path = Path('ui-hotfix.css')
css = css_path.read_text(encoding='utf-8')
marker = '/* Teacher bulk selection */'
if marker not in css:
    css += r'''

/* Teacher bulk selection */
.teacher-bulk-toolbar {
  margin: 0 12px 10px;
  padding: 12px;
  display: grid;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-soft);
}
.teacher-bulk-toolbar strong,
.teacher-bulk-toolbar small { display: block; }
.teacher-bulk-toolbar strong { color: var(--navy-950); font-size: 12px; }
.teacher-bulk-toolbar small { margin-top: 3px; color: var(--muted); font-size: 10px; }
.teacher-bulk-actions { display: flex; gap: 7px; flex-wrap: wrap; }
.teacher-bulk-actions button { flex: 1 1 auto; padding: 8px 10px; font-size: 10px; }
.teacher-list-row { display: grid; grid-template-columns: 34px minmax(0,1fr); align-items: stretch; gap: 6px; margin: 0 8px 7px; border-radius: 14px; }
.teacher-list-row.bulk-selected { background: var(--teal-100); box-shadow: inset -3px 0 0 var(--teal-600); }
.teacher-list-row .teacher-list-item { width: 100%; margin: 0; }
.teacher-bulk-check { display: grid; place-items: center; cursor: pointer; }
.teacher-bulk-check input { position: absolute; opacity: 0; pointer-events: none; }
.teacher-bulk-check span { width: 21px; height: 21px; border: 2px solid var(--border-strong); border-radius: 7px; background: #fff; position: relative; }
.teacher-bulk-check input:checked + span { border-color: var(--teal-700); background: var(--teal-700); }
.teacher-bulk-check input:checked + span::after { content: '✓'; position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font-size: 13px; font-weight: 900; }
@media (max-width: 560px) {
  .teacher-bulk-actions { display: grid; grid-template-columns: 1fr 1fr; }
  .teacher-bulk-actions [data-delete-selected-teachers] { grid-column: 1 / -1; }
}
'''
css_path.write_text(css, encoding='utf-8')

# 7) Smoke test: import three teachers, bulk-delete one, then continue with two.
test_path = Path('tests/ui-smoke.mjs')
test = test_path.read_text(encoding='utf-8')
test = test.replace("await page.locator('#teacherSelectionCount').fill('2');", "await page.locator('#teacherSelectionCount').fill('3');")
test = test.replace("assert.equal(await page.locator('#importPreview tbody tr').count(), 2, `${name}: two selected teachers in preview`);", "assert.equal(await page.locator('#importPreview tbody tr').count(), 3, `${name}: three selected teachers in preview`);")
test = test.replace("await page.waitForFunction(() => document.querySelectorAll('#importPreview tbody tr').length === 3);", "await page.waitForFunction(() => document.querySelectorAll('#importPreview tbody tr').length === 4);")
test = test.replace("await page.waitForFunction(() => document.querySelectorAll('#importPreview tbody tr').length === 2);", "await page.waitForFunction(() => document.querySelectorAll('#importPreview tbody tr').length === 3);")
test = test.replace(
    "assert.equal(await page.locator('.teacher-list-item').count(), 2, `${name}: two teachers imported`);\n\n  await assignTeacher(0, 'p4_1');",
    "assert.equal(await page.locator('.teacher-list-item').count(), 3, `${name}: three teachers imported`);\n  await page.locator('[data-bulk-teacher]').nth(2).check();\n  page.once('dialog', dialog => dialog.accept());\n  await page.locator('[data-delete-selected-teachers]').click();\n  await page.waitForFunction(() => document.querySelectorAll('.teacher-list-item').length === 2);\n  assert.equal(await page.locator('.teacher-list-item').count(), 2, `${name}: bulk deletion removes selected teacher`);\n\n  await assignTeacher(0, 'p4_1');",
)
test_path.write_text(test, encoding='utf-8')

/* TimeCraft — local-first school timetable and fixture manager
   Copyright (c) 2026 Tammarjan | Tammarjan94@gmail.com */
(() => {
'use strict';
const DB_NAME='timecraft-db', DB_VERSION=2;
const stores=['teachers','classes','subjects','slots','fixtures','settings','teachingAssignments'];
let db, currentView='dashboard', editing=null, selectedTimetableClassId=null;
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function eligibleTeacher(t,subjectName,className){
 const subjects=(t.subjects||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 const classes=(t.classes||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 return (!subjects.length||subjects.includes(String(subjectName).trim().toLowerCase()))&&(!classes.length||classes.includes(String(className).trim().toLowerCase()));
}
function slotCountsForTeacher(slot,teacher){const ids=slot.teacherIds|| (slot.teacherId!=null?[slot.teacherId]:[]);if(ids.length)return ids.some(id=>String(id)===String(teacher.id));return String(slot.teacherName||'').split('/').map(n=>n.trim().toLowerCase()).includes(String(teacher.name||'').trim().toLowerCase())}
function regularTeacherLoad(slots,teacher){return slots.filter(slot=>slotCountsForTeacher(slot,teacher)).length}
function slotTeacherIds(slot){const ids=(slot.teacherIds||[]).filter(v=>v!=null);return ids.length?ids:(slot.teacherId!=null?[slot.teacherId]:[])}
function slotTeacherNames(slot,teachers){const names=slotTeacherIds(slot).map(id=>teachers.find(t=>String(t.id)===String(id))?.name).filter(Boolean);return names.length?names.join(' / '):(slot.teacherName||'Unassigned')}
const defaultDaySchedule={assemblyStart:'08:30',assemblyEnd:'09:00',breakStart:'11:30',breakEnd:'12:00',offTime:'14:00',beforeBreak:[{name:'P1',start:'09:00',end:'09:40'},{name:'P2',start:'09:40',end:'10:20'},{name:'P3',start:'10:20',end:'10:55'},{name:'P4',start:'10:55',end:'11:30'}],afterBreak:[{name:'P5',start:'12:00',end:'12:40'},{name:'P6',start:'12:40',end:'13:20'},{name:'P7',start:'13:20',end:'14:00'}]};
const defaultFridaySchedule={assemblyStart:'08:30',assemblyEnd:'09:00',breakStart:'11:00',breakEnd:'11:30',offTime:'12:30',beforeBreak:[{name:'P1',start:'09:00',end:'09:45'},{name:'P2',start:'09:45',end:'10:25'},{name:'P3',start:'10:25',end:'11:00'}],afterBreak:[{name:'P4',start:'11:30',end:'12:00'},{name:'P5',start:'12:00',end:'12:30'}]};
const defaults={schoolName:'My School',workingDays:DAYS,daySchedules:Object.fromEntries(DAYS.map(d=>[d,JSON.parse(JSON.stringify(d==='Friday'?defaultFridaySchedule:defaultDaySchedule))]))};
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const d=req.result;stores.forEach(s=>{if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'id',autoIncrement:true})})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function all(store){return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function put(store,obj){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');const r=tx.objectStore(store).put(obj);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function add(store,obj){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');const r=tx.objectStore(store).add(obj);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function del(store,id){return new Promise((resolve,reject)=>{const r=db.transaction(store,'readwrite').objectStore(store).delete(Number(id));r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
async function setting(){const a=await all('settings');return a[0]||defaults}
async function saveSetting(v){const a=await all('settings');await put('settings',{...v,id:a[0]?.id||1})}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2400)}
function title(v){return ({dashboard:'Overview',timetable:'Timetable',assignments:'Teacher assignments & vacancies',fixtures:'Fixtures',teachers:'Teachers',classes:'Classes',subjects:'Subjects',settings:'Settings & backup'})[v]||'Overview'}
function setView(v){currentView=v;editing=null;$('#pageTitle').textContent=title(v);$('#crumb').textContent='TIMECRAFT WORKSPACE';document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===v));$('#sidebar').classList.remove('open');render()}
function nav(){document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));$('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'))}
function empty(titleText,sub){return '<div class="empty"><b>'+esc(titleText)+'</b>'+esc(sub)+'</div>'}
function btn(text,action,cls='btn small'){return '<button class="'+cls+'" data-action="'+action+'">'+esc(text)+'</button>'}
function table(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>'}
async function render(){const root=$('#appContent');root.innerHTML='<div class="empty">Loading workspace…</div>';try{if(currentView==='dashboard')root.innerHTML=await dashboard();else if(['teachers','classes','subjects'].includes(currentView))root.innerHTML=await listPage(currentView);else if(currentView==='settings')root.innerHTML=await settingsPage();else if(currentView==='timetable')root.innerHTML=await timetablePage();else if(currentView==='assignments'){root.innerHTML=await assignmentsPage();const f=$('#manualAssignForm');if(f){f.querySelectorAll('[name="classId"],[name="day"],[name="period"],[name="subjectId"]').forEach(x=>x.addEventListener('change',()=>refreshManualAssign(f)));await refreshManualAssign(f)}}else if(currentView==='fixtures')root.innerHTML=await fixturesPage();}catch(e){root.innerHTML=empty('Something went wrong',e.message||'Please refresh the app.');console.error(e)}}
async function dashboard(){const [ts,cs,ss,sl,fs,s]=await Promise.all(stores.map(x=>all(x)));const today=new Date().toLocaleDateString('en-GB');return '<div class="welcome"><div><h2>Plan every period with confidence.</h2><p>'+esc(s.schoolName||'Your school')+' · Your data stays on this device.</p></div>'+btn('Open timetable','goto-timetable','btn')+'</div><div class="stats">'+[['Teachers',ts.length,'Teacher records'],['Classes',cs.length,'Class groups'],['Subjects',ss.length,'Subjects configured'],['Timetable slots',sl.length,'Saved weekly periods']].map(x=>'<div class="stat"><div class="label">'+x[0]+'</div><strong>'+x[1]+'</strong><small>'+x[2]+'</small></div>').join('')+'</div><div class="dashboard-grid"><div class="panel"><div class="panel-head"><div><h3>Quick actions</h3><p>Build your school timetable workspace</p></div></div><div class="quick-grid"><button class="quick" data-action="goto-teachers"><div class="qicon">♙</div><b>Add teachers</b><small>Set subject and class eligibility</small></button><button class="quick" data-action="goto-classes"><div class="qicon">▤</div><b>Add classes</b><small>Create the class groups</small></button><button class="quick" data-action="goto-subjects"><div class="qicon">◈</div><b>Configure subjects</b><small>Set weekly periods per class</small></button><button class="quick" data-action="goto-timetable"><div class="qicon">▦</div><b>Generate timetable</b><small>Build a clash-free weekly plan</small></button></div></div><div class="panel"><div class="panel-head"><div><h3>Workspace health</h3><p>Local database status</p></div><span class="tag green">Ready</span></div><p class="muted" style="font-size:11px">Fixtures recorded: <b>'+fs.length+'</b></p><p class="muted" style="font-size:11px">Timetable slots: <b>'+sl.length+'</b></p><div class="notice">Tip: create a backup after every major timetable update. Your records are stored only in this browser.</div>'+btn('Backup data','backup','btn secondary')+'</div></div>'}
async function listPage(kind){const data=await all(kind),label=kind[0].toUpperCase()+kind.slice(1);let headers,rows;if(kind==='teachers'){headers=['Teacher','Actions'];rows=data.map(x=>'<tr><td><b>'+esc(x.name)+'</b></td><td><div class="actions">'+btn('Edit','edit-'+kind+'-'+x.id,'btn ghost small')+btn('Delete','delete-'+kind+'-'+x.id,'btn danger small')+'</div></td></tr>').join('')}else if(kind==='classes'){headers=['Class / section','Actions'];rows=data.map(x=>'<tr><td><b>'+esc(x.name)+'</b></td><td><div class="actions">'+btn('Delete','delete-'+kind+'-'+x.id,'btn danger small')+'</div></td></tr>').join('')}else{headers=['Subject','Class','Periods / week','Actions'];rows=data.map(x=>'<tr><td><b>'+esc(x.name)+'</b></td><td>'+esc(x.className||'All classes')+'</td><td>'+esc(x.periods||0)+'</td><td><div class="actions">'+btn('Edit','edit-'+kind+'-'+x.id,'btn ghost small')+btn('Delete','delete-'+kind+'-'+x.id,'btn danger small')+'</div></td></tr>').join('')}
const addLabel=kind==='teachers'?'Add Teacher':kind==='classes'?'Add Classes':'Add Subject';return '<div class="welcome"><div><h2>'+label+'</h2><p>Manage the information used by the timetable and fixture tools.</p></div>'+btn('＋ '+addLabel,'add-'+kind,'btn')+'</div><div class="panel">'+(data.length?table(headers,rows):empty('No '+kind+' added yet','Add your first record to get started.'))+'</div>'}
function openModal(html){const old=$('.modal-backdrop');if(old)old.remove();const d=document.createElement('div');d.className='modal-backdrop';d.innerHTML='<div class="modal">'+html+'</div>';document.body.appendChild(d);d.addEventListener('click',e=>{if(e.target===d)d.remove()})}
async function editForm(kind,id){
 const record=id?(await all(kind)).find(x=>x.id===Number(id))||{}:{};
 if(kind==='classes'){
  const current=await all('classes'),base=['Playgroup','Nursery','KG','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  const names=[...base,...current.map(x=>x.name).filter(n=>!base.includes(n))],selected=new Set(current.map(x=>x.name));
  openModal('<h3>Manage Classes</h3><p class="hint">Sirf required classes select karein. Uncheck ki hui classes active list se remove ho jayengi.</p><form id="classSelectionForm"><div class="check-grid class-picker">'+names.map(n=>'<label class="checkline"><input type="checkbox" name="selectedClasses" value="'+esc(n)+'" '+(selected.has(n)?'checked':'')+'>'+esc(n)+'</label>').join('')+'</div><div class="form-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn">Save Classes</button></div></form>');
  $('#classSelectionForm').addEventListener('submit',async e=>{e.preventDefault();const chosen=new Set(new FormData(e.target).getAll('selectedClasses')),existing=await all('classes');for(const x of existing)if(!chosen.has(x.name))await del('classes',x.id);for(const name of chosen)if(!existing.some(x=>x.name===name))await add('classes',{name});$('.modal-backdrop').remove();toast('Class selection saved');render()});return;
 }
 if(kind==='teachers'){
  openModal('<h3>'+(id?'Edit Teacher':'Add Teacher')+'</h3><form id="recordForm"><div class="field"><label>Teacher name *</label><input name="name" required value="'+esc(record.name||'')+'" placeholder="Enter teacher name"></div><div class="form-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn">Save Teacher</button></div></form>');
  $('#recordForm').addEventListener('submit',async e=>{e.preventDefault();const name=new FormData(e.target).get('name').trim();if(!name)return;const obj={...record,name,maxPeriods:record.maxPeriods??30,subjects:record.subjects??'',classes:record.classes??''};await (id?put('teachers',{...obj,id:Number(id)}):add('teachers',obj));$('.modal-backdrop').remove();toast('Teacher saved');render()});return;
 }
 let fields='';const classes=await all('classes');fields='<div class="field"><label>Subject name *</label><input name="name" required value="'+esc(record.name||'')+'" placeholder="e.g. Mathematics"></div><div class="field"><label>Class</label><select name="classId"><option value="">All classes</option>'+classes.map(x=>'<option value="'+x.id+'" '+(record.classId===x.id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></div><div class="field"><label>Periods per week</label><input name="periods" type="number" min="0" max="50" value="'+(record.periods??5)+'"></div>';
 openModal('<h3>'+(id?'Edit Subject':'Add Subject')+'</h3><form id="recordForm"><div class="form-grid">'+fields+'</div><div class="form-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn">Save record</button></div></form>');
 $('#recordForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.target),o=Object.fromEntries(fd);o.classId=o.classId?Number(o.classId):null;const cl=(await all('classes')).find(x=>x.id===o.classId);o.className=cl?.name||'All classes';o.periods=Number(o.periods)||0;await (id?put(kind,{...record,...o,id:Number(id)}):add(kind,o));$('.modal-backdrop').remove();toast('Saved successfully');render()});
}
function scheduleForDay(s,day){if(s.daySchedules?.[day])return s.daySchedules[day];return day==='Friday'?(s.fridaySchedule||defaultFridaySchedule):(s.daySchedule||defaultDaySchedule)}
function periodRowsHtml(group,items){return '<div class="period-list" data-period-group="'+group+'">'+items.map((p,i)=>'<div class="period-row"><input aria-label="Period name" data-period-name value="'+esc(p.name||('P'+(i+1)))+'" placeholder="P1"><label>From<input type="time" data-period-start value="'+esc(p.start||'09:00')+'"></label><label>To<input type="time" data-period-end value="'+esc(p.end||'10:00')+'"></label><button type="button" class="btn danger small" data-action="remove-period">Remove</button></div>').join('')+'</div>'+btn('＋ Add period','add-period-'+group,'btn secondary small')}
function scheduleEditorHtml(label,key,schedule){return '<div class="schedule-editor-inner"><div class="form-grid"><div class="field"><label><input type="checkbox" name="'+key+'-assemblyEnabled" '+(schedule.assemblyEnabled!==false?'checked':'')+'> Assembly</label></div><div class="field"><label>Assembly start</label><input type="time" name="'+key+'-assemblyStart" value="'+(schedule.assemblyStart||'08:30')+'"></div><div class="field"><label>Assembly end</label><input type="time" name="'+key+'-assemblyEnd" value="'+(schedule.assemblyEnd||'09:00')+'"></div><div class="field"><label><input type="checkbox" name="'+key+'-breakEnabled" '+(schedule.breakEnabled!==false?'checked':'')+'> Break</label></div><div class="field"><label>Break start</label><input type="time" name="'+key+'-breakStart" value="'+(schedule.breakStart||'11:30')+'"></div><div class="field"><label>Break end</label><input type="time" name="'+key+'-breakEnd" value="'+(schedule.breakEnd||'12:00')+'"></div><div class="field"><label>School off time</label><input type="time" name="'+key+'-offTime" value="'+(schedule.offTime||'14:00')+'"></div></div><h4>Periods before break</h4>'+periodRowsHtml(key+'-before',schedule.beforeBreak||[])+'<h4>Periods after break</h4>'+periodRowsHtml(key+'-after',schedule.afterBreak||[])+'</div>'}
async function settingsPage(){const s=await setting();const weekday=scheduleForDay(s,'Monday'),friday=scheduleForDay(s,'Friday');return '<div class="welcome"><div><h2>Settings & backup</h2><p>Monday, Tuesday, Wednesday, Thursday aur Saturday ki timing aik jaisi hogi. Friday ki timing alag set karein.</p></div></div><div class="panel form-card"><h3 class="section-title">School timetable settings</h3><p class="hint">Weekdays ka schedule sirf aik martaba set karein. Ye Monday–Thursday aur Saturday par apply hoga. Friday ka schedule alag rahega. Periods aur break optional hain.</p><form id="settingsForm"><div class="field"><label>School name</label><input name="schoolName" value="'+esc(s.schoolName||'My School')+'"></div><details class="schedule-editor day-editor" open><summary><b>Monday–Thursday & Saturday</b><span class="hint"> Shared timing</span></summary>'+scheduleEditorHtml('Monday–Thursday & Saturday','weekday',weekday)+'</details><details class="schedule-editor day-editor" open><summary><b>Friday</b><span class="hint"> Separate timing</span></summary>'+scheduleEditorHtml('Friday','Friday',friday)+'</details><div class="field"><label>Working days</label><div class="check-grid">'+DAYS.map(d=>'<label class="checkline"><input type="checkbox" name="days" value="'+d+'" '+((s.workingDays||DAYS).includes(d)?'checked':'')+'>'+d+'</label>').join('')+'</div></div><div class="form-actions"><button class="btn">Save timetable settings</button></div></form></div><div class="panel form-card" style="margin-top:16px"><h3 class="section-title">Backup & restore</h3><p class="hint">Export all teachers, classes, subjects, timetable slots, fixtures and settings to one JSON file.</p><div class="toolbar">'+btn('↓ Download backup','backup','btn')+'<label class="btn secondary" for="restoreFile">↑ Restore backup</label><input id="restoreFile" type="file" accept="application/json,.json" hidden></div><div class="danger-zone"><b>Reset local workspace</b><p class="hint">Permanently clears all TimeCraft records on this device. Export a backup first.</p>'+btn('Clear all data','reset','btn danger')+'</div></div>'}
async function timetablePage(){
 const [classes,subjects,teachers,slots,s]=await Promise.all(['classes','subjects','teachers','slots','settings'].map(x=>x==='settings'?setting():all(x)));
 const days=(s.workingDays||DAYS).filter(d=>DAYS.includes(d)),selected=classes.find(c=>String(c.id)===String(selectedTimetableClassId))||classes[0],classId=selected?.id||0,visible=slots.filter(x=>x.classId===selected?.id);selectedTimetableClassId=classId;
 if(!selected)return '<div class="welcome"><div><h2>Class Time Table</h2><p>Select or add a class to view its timetable.</p></div></div>'+empty('No classes','Add classes first.');
 const weekday=scheduleForDay(s,'Monday'),before=weekday.beforeBreak||[],after=weekday.afterBreak||[],weekdayPeriods=[...before,...after];
 const friday=scheduleForDay(s,'Friday'),fridayPeriods=[...(friday.beforeBreak||[]),...(friday.afterBreak||[])];
 const periodHeaders=weekdayPeriods.map((p,i)=>'<th><b>Period '+(i+1)+'</b><small>'+esc(p.start)+' – '+esc(p.end)+'</small></th>');
 periodHeaders.splice(before.length,0,'<th class="approved-break-head">Break<small>'+esc(weekday.breakStart)+' – '+esc(weekday.breakEnd)+'</small></th>');
 const rows=days.map(day=>{
  const sc=scheduleForDay(s,day),isFriday=day==='Friday',pre=sc.beforeBreak||[],post=sc.afterBreak||[],periods=[...pre,...post],timeStart=periods[0]?.start||'09:00',off=sc.offTime||'14:00';
  const timeLabel=(t)=>{const [h,m]=t.split(':').map(Number),ampm=h>=12?'PM':'AM',hh=h%12||12;return String(hh).padStart(2,'0')+':'+String(m).padStart(2,'0')+' '+ampm};
  const cell=(period,index)=>{const x=visible.find(z=>z.day===day&&z.period===index+1),time=isFriday?'<small>'+esc(period.start)+' – '+esc(period.end)+'</small>':'';return x?'<td><button class="approved-slot" data-action="edit-slot-'+x.id+'">'+time+'<b>'+esc(x.subjectName)+'</b><small>'+esc(slotTeacherNames(x,teachers))+'</small></button></td>':'<td><span class="approved-empty">—</span></td>'};
  const breakCell='<td class="approved-break-cell"><span>☕<b>Break</b><small>'+esc(sc.breakStart)+' – '+esc(sc.breakEnd)+'</small></span></td>';
  let dayCells='';
  if(isFriday){
   dayCells=pre.map((p,i)=>cell(p,i)).join('')+breakCell+post.map((p,i)=>cell(p,pre.length+i)).join('');
   if(post.length<3)dayCells+='<td class="approved-off" colspan="'+(4-post.length)+'"><b>OFF</b><small>('+esc(timeStart&&off?timeLabel(off):off)+')</small></td>';
  }else{
   dayCells=periods.map((p,i)=>cell(p,i)).join('');
   dayCells=dayCells.slice(0,0)+periods.slice(0,before.length).map((p,i)=>cell(p,i)).join('')+breakCell+periods.slice(before.length).map((p,i)=>cell(p,before.length+i)).join('');
  }
  return '<tr><th class="approved-day">'+esc(day)+'</th><td class="approved-time">'+esc(timeLabel(timeStart))+' – '+esc(timeLabel(off))+'</td>'+dayCells+'</tr>';
 }).join('');
 const schoolName=esc(s.schoolName||'Government Higher Secondary School');
 return '<div class="welcome"><div><h2>Class Time Table</h2><p>Approved A4 landscape layout · '+esc(selected.name)+'</p></div>'+btn('Generate timetable','generate','btn')+'</div><div class="toolbar"><select id="classFilter">'+classes.map(x=>'<option value="'+x.id+'" '+(x.id===classId?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select><span class="spacer"></span>'+btn('Class-wise PDF','print-class','btn secondary')+btn('Teacher-wise PDF','print-teacher','btn secondary')+'</div><div class="approved-timetable-wrap"><div class="approved-timetable-heading"><div class="approved-emblem">GHSS</div><div><h2>'+schoolName+'</h2><div class="approved-class-title">Class '+esc(selected.name)+' – Time Table</div></div><div class="approved-effective">Effective From:<br><b>21 October 2026</b></div></div><div class="approved-timetable-scroll"><table class="approved-timetable"><thead><tr><th>Day</th><th>Time</th>'+periodHeaders.join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}

async function generateTimetable(){
 const [classes,subjects,teachers,s,maps]=await Promise.all(['classes','subjects','teachers','settings','teachingAssignments'].map(x=>x==='settings'?setting():all(x)));
 if(!classes.length||!teachers.length||!subjects.length){toast('Add classes, subjects and teachers first');return}
 const days=(s.workingDays||DAYS).filter(d=>DAYS.includes(d)),dayOrder=[...DAYS];
 if(!days.length){toast('Select at least one working day');return}
 const periodsByDay={};
 for(const day of days){const sc=scheduleForDay(s,day);periodsByDay[day]=[...(sc.beforeBreak||[]),...(sc.afterBreak||[])].length}
 const totalPerClass=days.reduce((n,d)=>n+(periodsByDay[d]||0),0);
 const requirements=[];
 for(const cl of classes){
  const classSubjects=subjects.filter(x=>!x.classId||x.classId===cl.id);
  const totalRequired=classSubjects.reduce((n,x)=>n+Math.max(0,Number(x.periods)||0),0);
  if(totalRequired>totalPerClass){toast(cl.name+' requires '+totalRequired+' periods but only '+totalPerClass+' slots are available. Check subject periods or school settings.');return}
  for(const sub of classSubjects){
   const count=Number(sub.periods)||0;
   if(!Number.isInteger(count)||count<0){toast('Invalid weekly period count for '+cl.name+' — '+sub.name);return}
   if(count>totalPerClass){toast(cl.name+' — '+sub.name+' requires more weekly periods than available slots.');return}
   if(count)requirements.push({classId:cl.id,className:cl.name,subjectId:sub.id,subjectName:sub.name,remaining:count});
  }
 }
 const eligible=new Map();
 for(const req of requirements){
  const map=maps.find(x=>x.classId===req.classId&&x.subjectId===req.subjectId);
  const ids=map?(map.teacherIds||[map.teacherId]).filter(Boolean):null;
  const candidates=teachers.filter(t=>(!ids||ids.includes(t.id))&&eligibleTeacher(t,req.subjectName,req.className)&&Number(t.maxPeriods??30)>0);
  eligible.set(req.classId+'|'+req.subjectId,candidates.map(t=>t.id));
  if(!candidates.length){toast('No eligible teacher assigned to '+req.className+' — '+req.subjectName+'. Check Teacher Assignments.');return}
 }
 requirements.sort((a,b)=>{
  // English keeps its P1 priority. After English, schedule shared/co-teacher
  // subjects before single-teacher subjects so their common free periods
  // are not consumed by easier requirements first.
  const ae=String(a.subjectName).trim().toLowerCase()==='english',be=String(b.subjectName).trim().toLowerCase()==='english';
  if(ae!==be)return ae?-1:1;
  const ac=eligible.get(a.classId+'|'+a.subjectId).length,bc=eligible.get(b.classId+'|'+b.subjectId).length;
  const am=ac>1,bm=bc>1;
  if(am!==bm)return am?-1:1;
  return ac-bc||b.remaining-a.remaining;
 });
 const workload=new Map(teachers.map(t=>[t.id,0])),teacherSlots=new Set(),classSlots=new Set(),output=[];
 const key=(...v)=>v.join('|');
 for(const req of requirements){
  let lastDayIndex=-1;
  while(req.remaining>0){
   const candidates=[];
   for(let di=0;di<dayOrder.length;di++){
    const day=dayOrder[di];if(!days.includes(day))continue;
    for(let period=1;period<=(periodsByDay[day]||0);period++){
     if(classSlots.has(key(req.classId,day,period)))continue;
     if(String(req.subjectName).trim().toLowerCase()==='english'&&period!==1)continue;
     const assignedIds=eligible.get(req.classId+'|'+req.subjectId);
    const assignedTeachers=assignedIds.map(id=>teachers.find(t=>t.id===id)).filter(Boolean);
    if(assignedTeachers.length!==assignedIds.length)continue;
    if(assignedTeachers.some(t=>workload.get(t.id)>=Number(t.maxPeriods??30)||teacherSlots.has(key(t.id,day,period))))continue;
    // Prefer a gap between lessons. A pair of consecutive periods is allowed
    // only when no non-consecutive placement is available (high score penalty).
    // Never create a run of three consecutive periods for any teacher.
    const createsTriple=assignedTeachers.some(t=>{
     const occupied=p=>teacherSlots.has(key(t.id,day,p));
     return (occupied(period-1)&&occupied(period-2))||
            (occupied(period-1)&&occupied(period+1))||
            (occupied(period+1)&&occupied(period+2));
    });
    if(createsTriple)continue;
    const consecutive=assignedTeachers.some(t=>teacherSlots.has(key(t.id,day,period-1))||teacherSlots.has(key(t.id,day,period+1)));
    const loadScore=assignedTeachers.reduce((n,t)=>n+workload.get(t.id),0);
    const consecutivePenalty=consecutive?100000:0,dayPenalty=di===lastDayIndex?1:0;
    candidates.push({day,dayIndex:di,period,teachers:assignedTeachers,score:consecutivePenalty+loadScore*100+dayPenalty*10+period});
    }
   }
   candidates.sort((x,y)=>x.score-y.score||x.dayIndex-y.dayIndex||x.period-y.period);
   const chosen=candidates[0];
   if(!chosen){
    const shortage=req.className+' — '+req.subjectName;
    toast('Cannot complete timetable for '+shortage+'. Teacher availability, assignments, weekly limits or school periods need checking. Existing timetable preserved.');
    openModal('<h3>Timetable could not be completed</h3><p class="hint">'+esc(shortage)+' could not be placed. No partial timetable was saved. Check teacher assignments, weekly limits and available periods.</p><div class="form-actions"><button class="btn" data-action="close-modal">Close</button></div>');
    return;
   }
   const pi=[...(scheduleForDay(s,chosen.day).beforeBreak||[]),...(scheduleForDay(s,chosen.day).afterBreak||[])][chosen.period-1];
   classSlots.add(key(req.classId,chosen.day,chosen.period));
   chosen.teachers.forEach(t=>{teacherSlots.add(key(t.id,chosen.day,chosen.period));workload.set(t.id,workload.get(t.id)+1)});
   output.push({classId:req.classId,className:req.className,subjectId:req.subjectId,subjectName:req.subjectName,day:chosen.day,period:chosen.period,periodName:pi.name,start:pi.start,end:pi.end,teacherId:chosen.teachers[0].id,teacherIds:chosen.teachers.map(t=>t.id),teacherName:chosen.teachers.map(t=>t.name).join(' / ')});
   lastDayIndex=chosen.dayIndex;req.remaining--;
  }
 }
 const tx=db.transaction('slots','readwrite'),st=tx.objectStore('slots');st.clear();output.forEach(x=>st.add(x));
 await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});
 toast('Timetable generated successfully · '+output.length+' periods');render();
 openModal('<h3>Timetable generated successfully</h3><p class="hint">All '+output.length+' requested periods placed. Smart School scheduling logic applied: most-constrained subjects first, balanced teacher workload, spread subject periods across days, and avoid consecutive teacher periods unless necessary. No class or teacher clashes.</p><div class="form-actions"><button class="btn" data-action="close-modal">Close</button></div>');
}
async function editSlot(id){
 const [slots,teachers,subjects,maps]=await Promise.all(['slots','teachers','subjects','teachingAssignments'].map(all)),slot=slots.find(x=>x.id===Number(id));if(!slot)return;
 const subjectOptions=subjects.filter(x=>!x.classId||x.classId===slot.classId),initial=slotTeacherIds(slot).map(String);
 const eligibleFor=sid=>{const sub=subjects.find(x=>x.id===Number(sid)),map=maps.find(x=>x.classId===slot.classId&&x.subjectId===Number(sid)),allowed=map?(map.teacherIds||[map.teacherId]).filter(Boolean):null;return teachers.filter(t=>(!allowed||allowed.some(v=>String(v)===String(t.id)))&&eligibleTeacher(t,sub?.name||slot.subjectName,slot.className))};
 let eligible=eligibleFor(slot.subjectId);
 const checks=()=>eligible.map(t=>'<label class="checkline"><input type="checkbox" name="teacherIds" value="'+t.id+'" '+(initial.includes(String(t.id))?'checked':'')+'>'+esc(t.name)+'</label>').join('');
 openModal('<h3>Edit timetable period</h3><p class="hint">'+esc(slot.day)+' · '+esc(slot.periodName||('Period '+slot.period))+' · '+esc(slot.className)+'</p><form id="slotForm"><div class="field"><label>Subject</label><select name="subjectId">'+subjectOptions.map(x=>'<option value="'+x.id+'" '+(x.id===slot.subjectId?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></div><div class="field"><label>Assigned teachers (select all that apply)</label><div id="slotTeacherChoices" class="check-grid">'+checks()+'</div></div><div class="form-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn">Save changes</button></div></form>');
 $('#slotForm [name="subjectId"]').addEventListener('change',e=>{eligible=eligibleFor(e.target.value);initial.splice(0,initial.length);$('#slotTeacherChoices').innerHTML=checks()});
 $('#slotForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.target),ids=fd.getAll('teacherIds').map(Number),sid=Number(fd.get('subjectId')),sub=subjects.find(x=>x.id===sid);if(!ids.length){toast('Select at least one teacher');return}const chosen=ids.map(id=>teachers.find(t=>t.id===id)).filter(Boolean);if(chosen.length!==ids.length||chosen.some(t=>!eligibleTeacher(t,sub?.name,slot.className))){toast('Selected teacher is not eligible');return}
 const clash=slots.find(x=>x.id!==slot.id&&x.day===slot.day&&x.period===slot.period&&slotTeacherIds(x).some(tid=>ids.some(id=>String(id)===String(tid))));if(clash){toast('Conflict: selected teacher is already booked');return}
 await put('slots',{...slot,subjectId:sid,subjectName:sub.name,teacherId:ids[0],teacherIds:ids,teacherName:chosen.map(t=>t.name).join(' / ')});
 $('.modal-backdrop').remove();toast('Period and teacher assignments saved');render();
 });
}
async function assignmentsPage(){
 const [classes,subjects,teachers,slots,maps,s]=await Promise.all(['classes','subjects','teachers','slots','teachingAssignments','settings'].map(x=>x==='settings'?setting():all(x)));
 const pairs=[];for(const cl of classes)for(const sub of subjects.filter(x=>!x.classId||x.classId===cl.id)){const map=maps.find(x=>x.classId===cl.id&&x.subjectId===sub.id),count=slots.filter(x=>x.classId===cl.id&&x.subjectId===sub.id).length,need=Number(sub.periods||0);pairs.push({cl,sub,map,count,need,remaining:Math.max(0,need-count)})}
 const rows=pairs.map(p=>{const ids=p.map?.teacherIds|| (p.map?.teacherId?[p.map.teacherId]:[]),picker=i=>'<select data-map-class="'+p.cl.id+'" data-map-subject="'+p.sub.id+'" data-map-index="'+i+'" class="assignment-select"><option value="">Not assigned</option>'+teachers.map(t=>'<option value="'+t.id+'" '+(ids[i]===t.id?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select>';return '<tr><td><b>'+esc(p.cl.name)+'</b></td><td>'+esc(p.sub.name)+'</td><td>'+p.need+'</td><td><div class="assignment-pickers">'+picker(0)+picker(1)+'</div><small class="hint">One or two teachers</small></td><td><span class="tag '+(ids.length?'green':'red')+'">'+(ids.length?ids.length+' teacher(s) assigned':'Teacher vacant')+'</span></td><td><span class="tag '+(p.remaining?'red':'green')+'">'+p.remaining+' periods</span></td><td>'+p.count+' / '+p.need+'</td></tr>';}).join('');
 // Select values are set after rendering by a small inline initialization pass below.
 const dayOpts=(s.workingDays||DAYS).map(d=>'<option>'+d+'</option>').join('');
 return '<div class="welcome"><div><h2>Teacher assignments & vacancies</h2><p>Har class ke subject ko teacher assign karein aur unfilled periods dekhein.</p></div></div><div class="panel"><div class="panel-head"><div><h3>Subject teacher allocation</h3><p class="hint">Teacher select karte hi assignment save ho jayegi. Timetable generator isi assignment ko follow karega.</p></div></div>'+(pairs.length?table(['Class','Subject','Required / week','Assigned teacher','Teacher status','Period vacancies','Scheduled'],rows):empty('No subject records','Add classes and subjects first.'))+'</div><div class="panel form-card" style="margin-top:16px"><h3 class="section-title">Vacant subject periods</h3><p class="hint">Yeh woh weekly periods hain jo subject ke required count ke muqable mein abhi timetable mein place nahi hue.</p>'+(pairs.some(p=>p.remaining)?table(['Class','Subject','Required','Scheduled','Vacant'],pairs.filter(p=>p.remaining).map(p=>'<tr><td>'+esc(p.cl.name)+'</td><td>'+esc(p.sub.name)+'</td><td>'+p.need+'</td><td>'+p.count+'</td><td><b>'+p.remaining+'</b></td></tr>').join('')):empty('No vacant periods','All configured subject periods are currently scheduled.'))+'</div><div class="panel form-card" style="margin-top:16px"><h3 class="section-title">Subjects needing a teacher</h3><p class="hint">Is list mein woh subjects hain jin ke liye abhi koi teacher assign nahi hua.</p>'+(pairs.some(p=>!p.map)?table(['Class','Subject','Required periods','Status'],pairs.filter(p=>!p.map).map(p=>'<tr><td>'+esc(p.cl.name)+'</td><td>'+esc(p.sub.name)+'</td><td>'+p.need+'</td><td><span class="tag red">Teacher required</span></td></tr>').join('')):empty('No teacher vacancies','Every subject has an assigned teacher.'))+'</div><div class="panel form-card" style="margin-top:16px"><h3 class="section-title">Manually assign a specific period</h3><p class="hint">Choose class, day and period, then assign its subject and teacher. Existing lessons and clashes are protected.</p><form id="manualAssignForm"><div class="form-grid"><div class="field"><label>Class</label><select name="classId" required>'+classes.map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join('')+'</select></div><div class="field"><label>Day</label><select name="day">'+dayOpts+'</select></div><div class="field"><label>Period</label><select name="period" required></select></div><div class="field"><label>Subject</label><select name="subjectId" required></select></div><div class="field"><label>Teacher</label><select name="teacherId" required></select></div></div><div class="form-actions"><button class="btn">Assign period</button></div></form></div>';
}
async function refreshManualAssign(form){
 const [classes,subjects,teachers,slots,maps,s]=await Promise.all(['classes','subjects','teachers','slots','teachingAssignments','settings'].map(x=>x==='settings'?setting():all(x)));
 const f=Object.fromEntries(new FormData(form)),cl=classes.find(x=>x.id===Number(f.classId)),sc=scheduleForDay(s,f.day),periods=[...(sc.beforeBreak||[]),...(sc.afterBreak||[])],periodSel=form.elements.period;
 const oldPeriod=periodSel.value;periodSel.innerHTML=periods.map((p,i)=>'<option value="'+(i+1)+'">'+esc(p.name)+' · '+p.start+'–'+p.end+'</option>').join('');if(periods.some((p,i)=>String(i+1)===oldPeriod))periodSel.value=oldPeriod;
 const subjectSel=form.elements.subjectId,oldSub=subjectSel.value,validSubs=subjects.filter(x=>!x.classId||x.classId===cl?.id);subjectSel.innerHTML=validSubs.map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join('');if(validSubs.some(x=>String(x.id)===oldSub))subjectSel.value=oldSub;
 const sid=Number(subjectSel.value),map=maps.find(x=>x.classId===cl?.id&&x.subjectId===sid),allowed=map?(map.teacherIds||[map.teacherId]).filter(Boolean):null,mapped=allowed?teachers.filter(t=>allowed.includes(t.id)):teachers;
 const free=mapped.filter(t=>eligibleTeacher(t,subjects.find(x=>x.id===sid)?.name,cl?.name)&&!slots.some(x=>x.day===f.day&&x.period===Number(periodSel.value)&&x.teacherId===t.id));
 form.elements.teacherId.innerHTML=free.map(t=>'<option value="'+t.id+'">'+esc(t.name)+'</option>').join('');if(!free.length)form.elements.teacherId.innerHTML='<option value="">No free eligible teacher</option>';
}
async function saveManualAssignment(form){
 const [classes,subjects,teachers,slots,maps,s]=await Promise.all(['classes','subjects','teachers','slots','teachingAssignments','settings'].map(x=>x==='settings'?setting():all(x)));
 const f=Object.fromEntries(new FormData(form)),classId=Number(f.classId),subjectId=Number(f.subjectId),period=Number(f.period),teacherId=Number(f.teacherId),cl=classes.find(x=>x.id===classId),sub=subjects.find(x=>x.id===subjectId),teacher=teachers.find(x=>x.id===teacherId),sc=scheduleForDay(s,f.day),pi=[...(sc.beforeBreak||[]),...(sc.afterBreak||[])][period-1],map=maps.find(x=>x.classId===classId&&x.subjectId===subjectId);
 if(!cl||!sub||!teacher||!pi){toast('Please complete all assignment fields');return}
 if(slots.some(x=>x.classId===classId&&x.day===f.day&&x.period===period)){toast('This class period is already occupied');return}
 if(slots.some(x=>x.teacherId===teacherId&&x.day===f.day&&x.period===period)){toast('This teacher is already busy in this period');return}
 if(map&&!(map.teacherIds||[map.teacherId]).filter(Boolean).includes(teacherId)){toast('Choose one of the teachers assigned to this subject');return}
 if(!eligibleTeacher(teacher,sub.name,cl.name)){toast('Teacher is not eligible for this subject/class');return}
 await add('slots',{classId,className:cl.name,subjectId,subjectName:sub.name,day:f.day,period,periodName:pi.name,start:pi.start,end:pi.end,teacherId,teacherName:teacher.name});
 toast('Period assigned successfully');render();
}

async function fixturesPage(){
 const [teachers,slots,fixtures,settings]=await Promise.all(['teachers','slots','fixtures','settings'].map(x=>x==='settings'?setting():all(x)));
 const date=new Date().toISOString().slice(0,10),day=DAYS[(new Date().getDay()+6)%7],daily=fixtures.filter(f=>f.date===date);
 const rows=fixtures.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(a.period||0)-(b.period||0)).map(f=>'<tr><td>'+esc(f.date)+'</td><td>'+esc(f.day)+'</td><td>'+esc(f.className)+' · '+esc(f.periodName||('P'+f.period))+'</td><td>'+esc(f.subjectName)+'</td><td>'+esc(f.absentName)+'</td><td>'+(f.substituteName?'<span class="tag green">'+esc(f.substituteName)+'</span>':'<span class="tag red">Pending</span>')+'</td><td>'+esc(f.reason||'—')+'</td><td>'+btn('Manual assign','manual-fixture-'+f.id,'btn secondary small')+' '+btn('Delete','delete-fixture-'+f.id,'btn danger small')+'</td></tr>').join('');
 return '<div class="welcome"><div><h2>Substitute fixtures</h2><p>Mark all absent teachers once, then auto-assign available substitutes.</p></div>'+btn('↓ Download fixture report','fixture-report','btn secondary')+'</div><div class="panel form-card"><h3 class="section-title">Daily absence check & automatic fixtures</h3><div class="field"><label>Date</label><input id="fixtureDate" type="date" value="'+date+'"></div><p class="hint">Select every teacher who is Absent / On Leave for this date. Auto assignment checks the full Monday–Saturday timetable load, then filters teachers who are free in that exact period.</p><div id="absentTeacherList" class="check-grid">'+teachers.map(t=>'<label class="checkline"><input type="checkbox" class="absent-teacher" value="'+t.id+'">'+esc(t.name)+'</label>').join('')+'</div><div class="form-actions">'+btn('Auto assign fixtures','auto-fixtures','btn')+'</div></div><div class="panel"><div class="panel-head"><div><h3>Fixture report</h3><p>'+fixtures.length+' period records · '+daily.length+' for today</p></div></div>'+(fixtures.length?table(['Date','Day','Class / period','Subject','Absent teacher','Substitute','Status',''],rows):empty('No fixtures recorded','Select absent teachers above and run automatic assignment.'))+'</div>';
}
async function autoAssignFixtures(){
 const date=$('#fixtureDate')?.value,absentIds=Array.from(document.querySelectorAll('.absent-teacher:checked')).map(x=>String(x.value));
 if(!date||!absentIds.length){toast('Select date and at least one absent teacher');return}
 const [teachers,slots,fixtures,settings]=await Promise.all(['teachers','slots','fixtures','settings'].map(x=>x==='settings'?setting():all(x)));
 const day=DAYS[(new Date(date+'T12:00:00').getDay()+6)%7];
 if(!(settings.workingDays||DAYS).includes(day)){toast(day+' is not a working day in Settings');return}
 const sameId=(a,b)=>String(a)===String(b),absentSet=new Set(absentIds),absent=teachers.filter(t=>absentSet.has(String(t.id)));
 // A teacher recorded absent anywhere on this date must never be used as a substitute.
 const dayAbsentSet=new Set([...absentSet,...fixtures.filter(f=>f.date===date&&f.absentId!=null).map(f=>String(f.absentId))]);
 const weekStart=new Date(date+'T12:00:00');weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));const weekEnd=new Date(weekStart);weekEnd.setDate(weekEnd.getDate()+6);const weekKey=d=>{const z=new Date(d+'T12:00:00');return z>=weekStart&&z<=weekEnd};
 // Never allow a selected absent teacher to be chosen as a substitute, even if their weekly load is lowest.
 const load=new Map(teachers.map(t=>[String(t.id),regularTeacherLoad(slots,t)+fixtures.filter(f=>sameId(f.substituteId,t.id)&&weekKey(f.date)&&(f.date!==date||f.assignmentSource==='manual')).length]));
 const dayAssignments=fixtures.filter(f=>f.date===date&&f.substituteId&&!absentSet.has(String(f.absentId)));
 const alreadyUsedToday=new Set(dayAssignments.map(f=>String(f.substituteId)));
 const occupied=new Set(slots.filter(x=>x.day===day).map(x=>String(x.teacherId)+'|'+x.period));
 fixtures.filter(f=>f.date===date&&f.substituteId&&!absentSet.has(String(f.absentId))).forEach(f=>occupied.add(String(f.substituteId)+'|'+f.period));
 const pending=[];
 for(const absentTeacher of absent){
  const lessons=slots.filter(x=>sameId(x.teacherId,absentTeacher.id)&&x.day===day).sort((a,b)=>a.period-b.period);
  for(const lesson of lessons){
   const choices=teachers.filter(t=>!sameId(t.id,absentTeacher.id)&&!dayAbsentSet.has(String(t.id))&&!alreadyUsedToday.has(String(t.id))&&Number(t.maxPeriods??30)>Number(load.get(String(t.id))||0)&&eligibleTeacher(t,lesson.subjectName,lesson.className)&&!occupied.has(String(t.id)+'|'+lesson.period));
   choices.sort((a,b)=>(load.get(String(a.id))||0)-(load.get(String(b.id))||0)||a.name.localeCompare(b.name));
   const sub=choices[0]||null;
   if(sub){alreadyUsedToday.add(String(sub.id));occupied.add(String(sub.id)+'|'+lesson.period);load.set(String(sub.id),(load.get(String(sub.id))||0)+1)}
   pending.push({date,day,absentId:absentTeacher.id,absentName:absentTeacher.name,classId:lesson.classId,className:lesson.className,subjectId:lesson.subjectId,subjectName:lesson.subjectName,period:lesson.period,periodName:lesson.periodName||('P'+lesson.period),start:lesson.start||'',end:lesson.end||'',substituteId:sub?.id||null,substituteName:sub?.name||'',reason:sub?'Auto-assigned (lowest weekly load, free in period; max one auto fixture today)':'No eligible free teacher available',assignmentSource:'auto'});
  }
 }
 const tx=db.transaction('fixtures','readwrite'),store=tx.objectStore('fixtures');
 fixtures.filter(f=>f.date===date&&((absentSet.has(String(f.absentId))&&f.assignmentSource!=='manual')||(f.assignmentSource==='auto'&&f.substituteId&&dayAbsentSet.has(String(f.substituteId))))).forEach(f=>store.delete(f.id));
 pending.forEach(f=>store.add(f));
 await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});
 toast(pending.filter(x=>x.substituteId).length+' auto fixtures assigned; '+pending.filter(x=>!x.substituteId).length+' need manual action');render();
}
async function manualFixture(id){
 const [teachers,slots,fixtures]=await Promise.all(['teachers','slots','fixtures'].map(all)),f=fixtures.find(x=>x.id===Number(id));if(!f)return;
 const dayAbsentSet=new Set(fixtures.filter(x=>x.date===f.date&&x.absentId!=null).map(x=>String(x.absentId)));dayAbsentSet.add(String(f.absentId));
 const weekStart=new Date(f.date+'T12:00:00');weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));const weekEnd=new Date(weekStart);weekEnd.setDate(weekEnd.getDate()+6);const inWeek=d=>{const z=new Date(d+'T12:00:00');return z>=weekStart&&z<=weekEnd};const sameId=(a,b)=>String(a)===String(b);const load=t=>regularTeacherLoad(slots,t)+fixtures.filter(x=>x.id!==f.id&&sameId(x.substituteId,t.id)&&inWeek(x.date)).length;
 const occupied=slots.filter(x=>x.day===f.day&&x.period===f.period).map(x=>x.teacherId).filter(x=>x!==f.absentId).concat(fixtures.filter(x=>x.date===f.date&&x.period===f.period&&x.substituteId&&x.id!==f.id).map(x=>x.substituteId));
 const candidates=teachers.filter(t=>t.id!==f.absentId&&!dayAbsentSet.has(String(t.id))&&eligibleTeacher(t,f.subjectName,f.className)&&!occupied.includes(t.id)&&Number(t.maxPeriods??30)>load(t)).sort((a,b)=>load(a)-load(b)||a.name.localeCompare(b.name));
 openModal('<h3>Manual fixture assignment</h3><p class="hint">'+esc(f.date)+' · '+esc(f.day)+' · '+esc(f.className)+' · '+esc(f.subjectName)+' · '+esc(f.periodName||('P'+f.period))+'</p><p>Only eligible teachers free in this period are listed. Lowest weekly load appears first. Manual assignment can give a teacher a second fixture on the same day if there is no period clash.</p><form id="manualFixtureForm"><div class="field"><label>Substitute teacher</label><select name="substituteId" required><option value="">Choose free teacher</option>'+candidates.map(t=>'<option value="'+t.id+'">'+esc(t.name)+' — '+load(t)+' weekly load</option>').join('')+'</select></div><div class="form-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" '+(!candidates.length?'disabled':'')+'>Assign manually</button></div></form>');
 $('#manualFixtureForm').addEventListener('submit',async e=>{e.preventDefault();const id2=Number(new FormData(e.target).get('substituteId')),sub=candidates.find(t=>t.id===id2);if(!sub) return;const latest=(await all('fixtures')).find(x=>x.id===f.id);if(!latest)return;await put('fixtures',{...latest,substituteId:sub.id,substituteName:sub.name,reason:'Manually assigned',assignmentSource:'manual'});$('.modal-backdrop')?.remove();toast('Manual fixture assigned');render()});
}
async function downloadFixtureReport(date,records,teachers,slots,settings){
 const day=DAYS[(new Date(date+'T12:00:00').getDay()+6)%7],rows=records.filter(f=>f.date===date).sort((a,b)=>(a.period||0)-(b.period||0));
 const schedule=scheduleForDay(settings||defaults,day),periods=[...(schedule.beforeBreak||[]),...(schedule.afterBreak||[])];
 const periodText=f=>{const p=periods[(Number(f.period)||1)-1];return (f.periodName||p?.name||('P'+f.period))+(p?' ('+p.start+'-'+p.end+')':'')};
 const weekStart=new Date(date+'T12:00:00');weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));const weekEnd=new Date(weekStart);weekEnd.setDate(weekEnd.getDate()+6);const inSelectedWeek=d=>{const z=new Date(d+'T12:00:00');return z>=weekStart&&z<=weekEnd};
 const sameId=(a,b)=>String(a)===String(b);const regularLoad=id=>{const teacher=teachers.find(t=>sameId(t.id,id));return teacher?regularTeacherLoad(slots,teacher):slots.filter(v=>sameId(v.teacherId,id)).length};const workloadByRow=new Map();const running=new Map();records.filter(v=>v.substituteId&&inSelectedWeek(v.date)).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||(Number(a.period)||0)-(Number(b.period)||0)||(Number(a.id)||0)-(Number(b.id)||0)).forEach(v=>{const key=String(v.substituteId),next=(running.get(key)??regularLoad(v.substituteId))+1;running.set(key,next);workloadByRow.set(v.id,next)});const workloadFor=f=>workloadByRow.get(f.id)??(f.substituteId?regularLoad(f.substituteId):0);
 const assigned=rows.filter(f=>f.substituteId),pending=rows.filter(f=>!f.substituteId);
 const uniqueAbsent=new Set(rows.map(f=>f.absentTeacherId||f.absentName).filter(Boolean)).size,uniqueSub=new Set(assigned.map(f=>f.substituteId)).size;
 const safe=v=>String(v??'').replace(/[^\x20-\x7E]/g,'?').replace(/[()\\]/g,'\\$&'),ops=[];
 const rect=(x,y,w,h,fill,stroke=null,lw=.7)=>{if(fill)ops.push(fill+' rg');if(stroke)ops.push(stroke+' RG '+lw+' w');ops.push(x+' '+y+' '+w+' '+h+' re '+(fill&&stroke?'B':fill?'f':'S'))};
 const line=(x,y,X,Y,color='0.78 0.82 0.88',width=.7)=>ops.push(color+' RG '+width+' w '+x+' '+y+' m '+X+' '+Y+' l S');
 const txt=(x,y,size,value,font='F1',color='0.04 0.06 0.10')=>ops.push(color+' rg BT /'+font+' '+size+' Tf '+x+' '+y+' Td ('+safe(value)+') Tj ET');
 const width=(v,z)=>String(v).length*z*.51,center=(x,y,w,z,v,font='F1',color='0.04 0.06 0.10')=>txt(x+(w-width(v,z))/2,y,z,v,font,color);
 const right=(x,y,z,v,font='F1',color='0.04 0.06 0.10')=>txt(x-width(v,z),y,z,v,font,color);
 const wrap=(v,max)=>{const words=String(v||'').split(/\s+/),out=[];let cur='';for(const word of words){if((cur+' '+word).trim().length>max&&cur){out.push(cur);cur=word}else cur=(cur+' '+word).trim()}if(cur)out.push(cur);return out};
 // White paper, rounded-looking double frame and navy/gold school identity.
 rect(2,2,838,591,'1 1 1','0.02 0.04 0.08',1.5);rect(7,7,828,581,null,'0.72 0.55 0.22',.7);
 // Header banner with restrained gold corner accents.
 rect(9,526,824,60,'0.025 0.055 0.105');
 rect(9,526,7,60,'0.78 0.59 0.22');rect(826,526,7,60,'0.78 0.59 0.22');
 // Small decorative book/seal medallions.
 rect(33,542,30,27,'0.08 0.15 0.25','0.82 0.68 0.38',.8);
 center(33,551,30,10,'TC','F2','0.96 0.88 0.68');
 rect(779,542,30,27,'0.08 0.15 0.25','0.82 0.68 0.38',.8);
 center(779,551,30,10,'TC','F2','0.96 0.88 0.68');
 center(65,548,712,22,'TEACHER FIXTURE AND SUBSTITUTE REPORT','F3','1 1 1');
 // Day and date line, aligned with report body.
 rect(22,489,798,28,'1 1 1');
 txt(29,499,11,'DAY:','F2','0.02 0.04 0.08');txt(70,499,11,day.toUpperCase(),'F2','0.02 0.04 0.08');
 const dateDisplay=date.split('-').reverse().join('-');right(813,499,11,'DATE: '+dateDisplay,'F2','0.02 0.04 0.08');
 // Ribbon heading.
 line(52,466,224,466,'0.05 0.20 0.38',2.2);line(618,466,790,466,'0.05 0.20 0.38',2.2);
 rect(235,450,372,32,'0.035 0.22 0.43','0.72 0.55 0.22',.8);
 rect(245,454,352,24,'0.05 0.31 0.58');
 center(245,460,352,15,'FIXTURE ASSIGNMENTS','F3','1 1 1');
 // Exact image-inspired nine-column table.
 // Responsive one-page layout: gradual scaling by fixture count.
 const count=rows.length;
 const rh=count<=5?30:count<=10?30-(count-5)*1.4:count<=12?23-(count-10)*.8:count<=17?21.4-(count-12)*.38:19.5;
 const hh=count<=5?38:count<=12?34:30;
 const bodyFont=count<=5?7.3:count<=10?6.8-(count-6)*.13:count<=12?6.28-(count-10)*.18:5.92-(count-13)*.07;
 const headFont=count<=5?6.8:count<=12?6.2:5.8;
 const cols=[['#',30],['TEACHER NAME',120],['SUBJECT',96],['CLASS',52],['PERIOD (TIME)',104],['FOR (ABSENT TEACHER)',134],['WEEKLY WORKLOAD',88],['STATUS',92],['SIGNATURE',90]];
 const tx=12,tw=cols.reduce((n,c)=>n+c[1],0);let y=437,cx=tx;
 cols.forEach(([name,w])=>{rect(cx,y-hh,w,hh,'0.025 0.09 0.17','0.62 0.68 0.74',.55);const parts=name==='WEEKLY WORKLOAD'?['WEEKLY','WORKLOAD']:wrap(name,Math.max(5,Math.floor(w/(headFont*.76))));const shown=parts.slice(0,2),lineH=headFont*1.28;shown.forEach((v,i)=>center(cx,y-hh/2+(shown.length-1)*lineH/2-i*lineH-headFont*.34,w,headFont,v,'F2','1 1 1'));cx+=w});
 y-=hh;
 if(rows.length){
  rows.forEach((f,i)=>{
   cx=tx;const sub=f.substituteName||'Unassigned',status=f.substituteId?'ASSIGNED':'PENDING';
   const values=[String(i+1),sub,f.subjectName||'',f.className||'',periodText(f),f.absentName||'',f.substituteId?String(workloadFor(f)):'—',status,''];
   cols.forEach(([name,w],j)=>{
    rect(cx,y-rh,w,rh,i%2===0?'0.96 0.975 0.99':'1 1 1','0.68 0.73 0.79',.5);
    if(j===6)rect(cx+1,y-rh+1,w-2,rh-2,'0.84 0.90 0.98');
    if(j===7){const bh=Math.max(8,Math.min(14,rh*.52));rect(cx+5,y-rh+(rh-bh)/2,w-10,bh,f.substituteId?'0.04 0.48 0.20':'0.70 0.32 0.08');center(cx+5,y-rh+(rh-bh)/2+bh*.34,w-10,Math.min(6.4,bodyFont*.88),status,'F2','1 1 1')}
    else{
     const max=Math.max(4,Math.floor((w-8)/(bodyFont*.58))),parts=wrap(values[j],max).slice(0,2),lineH=Math.min(9,bodyFont*1.22);
     const startY=y-rh/2+(parts.length-1)*lineH/2-bodyFont*.34;
     parts.forEach((v,k)=>center(cx+2,startY-k*lineH,w-4,j===0?Math.min(8.5,bodyFont+1):bodyFont,v,j===0||j===6?'F2':'F1','0.035 0.06 0.10'));
    }
    cx+=w;
   });
   y-=rh;
  });
 }else{
  rect(tx,y-rh,tw,rh,'0.97 0.98 0.99','0.68 0.73 0.79',.5);center(tx,y-rh/2-3,tw,9,'NO FIXTURE ASSIGNMENTS FOR THIS DATE','F2','0.35 0.40 0.48');y-=rh;
 }
 // Summary and notes remain for up to 12; remove both panels from 13 onwards.
 if(count<=12){
  const compact=count>=9,panelY=count<=5?66:count<=8?58:50,panelH=count<=5?119:count<=8?88:72,leftX=16,leftW=310,rightX=350,rightW=476,barH=count<=5?27:compact?19:22;
  rect(leftX,panelY,leftW,panelH,'0.99 0.995 1','0.10 0.15 0.22',.8);rect(leftX,panelY+panelH-barH,leftW,barH,'0.025 0.09 0.17');
  txt(leftX+17,panelY+panelH-barH*.70,compact?9:count<=5?12:10,'SUMMARY (TODAY)','F2','1 1 1');
  const summary=[['Total Fixtures Assigned',String(assigned.length)],['Total Pending',String(pending.length)],['Absent Teachers',String(uniqueAbsent)],['Assigned Teachers',String(uniqueSub)]];
  const summaryFont=compact?7.1:count<=5?9:8.1,gap=(panelH-barH-10)/4;
  summary.forEach((v,i)=>{const yy=panelY+panelH-barH-8-(i+.75)*gap;if(i%2===0)rect(leftX+9,yy-3,leftW-18,Math.max(10,gap-1),'0.88 0.93 0.99');txt(leftX+17,yy,summaryFont,v[0],'F2');right(leftX+leftW-22,yy,summaryFont+.5,v[1],'F2')});
  rect(rightX,panelY,rightW,panelH,'0.99 0.995 1','0.10 0.15 0.22',.8);rect(rightX,panelY+panelH-barH,rightW,barH,'0.025 0.09 0.17');
  txt(rightX+17,panelY+panelH-barH*.70,compact?9:count<=5?12:10,'NOTES','F2','1 1 1');
  const notes=['Fixtures are auto-assigned by lowest weekly workload and period availability.','Only one fixture is auto-assigned per substitute teacher per day.','Additional fixtures may be assigned manually by Admin/Head.'];
  const noteFont=compact?6.1:count<=5?8:7.1,noteGap=compact?13:count<=5?22:17,notesTop=panelY+panelH-barH-(compact?13:22);
  notes.forEach((v,i)=>{const yy=notesTop-i*noteGap;rect(rightX+17,yy-1.5,4,4,'0.06 0.12 0.20');txt(rightX+29,yy-1,noteFont,v,'F1','0.08 0.10 0.14')});
 }
 // Footer bar with bright blue/gold end accents.
 rect(9,12,824,32,'0.025 0.055 0.105');rect(9,12,80,32,'0.02 0.30 0.70');rect(753,12,80,32,'0.02 0.30 0.70');
 line(112,28,265,28,'0.86 0.89 0.93',1.1);line(577,28,730,28,'0.86 0.89 0.93',1.1);
 center(265,23,312,11,'GENERATED BY TIMECRAFT','F2','1 1 1');
 const stream=ops.join('\n'),o=[],add=v=>(o.push(v),o.length);
 const f1=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 const f2=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
 const f3=add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>');
 const c=add('<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream');
 const p=add('<< /Type /Page /Parent PAGES 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 '+f1+' 0 R /F2 '+f2+' 0 R /F3 '+f3+' 0 R >> >> /Contents '+c+' 0 R >>');
 const ps=add('<< /Type /Pages /Kids ['+p+' 0 R] /Count 1 >>');o[p-1]=o[p-1].replace('PAGES',String(ps));
 const cat=add('<< /Type /Catalog /Pages '+ps+' 0 R >>');let pdf='%PDF-1.4\n',offs=[0];o.forEach((v,i)=>{offs.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+v+'\nendobj\n'});
 const xr=pdf.length;pdf+='xref\n0 '+(o.length+1)+'\n0000000000 65535 f \n'+offs.slice(1).map(v=>String(v).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(o.length+1)+' /Root '+cat+' 0 R >>\nstartxref\n'+xr+'\n%%EOF';
 const blob=new Blob([pdf],{type:'application/pdf'});if('caches' in window)caches.open('timecraft-fixture-reports-v6').then(v=>v.put(new Request(location.origin+'/timecraft-fixture-report-'+date+'.pdf'),new Response(blob,{headers:{'Content-Type':'application/pdf'}}))).catch(()=>{});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Teacher-Fixture-Report-'+date+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('Fixture report downloaded');
}
async function printTimetables(kind){
 const [classes,teachers,slots,s]=await Promise.all(['classes','teachers','slots','settings'].map(x=>x==='settings'?setting():all(x)));
 if(!slots.length){toast('Generate a timetable before printing');return}
 const days=(s.workingDays||DAYS).filter(d=>DAYS.includes(d)),people=kind==='class'?classes:teachers;
 if(kind==='teacher'){
  const activeTeachers=teachers.filter(person=>slots.some(x=>slotTeacherIds(x).some(id=>String(id)===String(person.id))));
  const cards=activeTeachers.map(person=>{
   const relevant=slots.filter(x=>slotTeacherIds(x).some(id=>String(id)===String(person.id)));
   const rows=days.map(day=>{
    const sc=scheduleForDay(s,day),pre=sc.beforeBreak||[],post=sc.afterBreak||[],periods=[...pre,...post];
    const periodCell=(p,i)=>{
     const x=relevant.find(z=>z.day===day&&z.period===i+1);
     return '<div class="mini-period"><b>P'+(i+1)+'</b><i>'+esc(p.start)+'<br>'+esc(p.end)+'</i>'+(x?'<strong>'+esc(x.subjectName)+'</strong><small>'+esc(x.className)+'</small>':'')+'</div>';
    };
    const br='<div class="mini-break"><b>BREAK</b><small>'+esc(sc.breakStart)+'<br>'+esc(sc.breakEnd)+'</small></div>';
    const track=pre.map((p,i)=>periodCell(p,i)).join('')+br+post.map((p,i)=>periodCell(p,pre.length+i)).join('');
    return '<tr><th class="mini-day">'+esc(day.slice(0,3))+'</th><td><div class="mini-track">'+track+'</div></td></tr>';
   }).join('');
   const designation=person.designation||person.role||'Teacher';
   return '<article class="cnic-card"><header class="cnic-head"><div class="cnic-seal">GHSS</div><div class="cnic-school">'+esc(s.schoolName||'Government Higher Secondary School')+'<b>TEACHER’S TIME TABLE</b></div><div class="cnic-effective">Effective<br><b>21 Oct 2026</b></div></header><div class="cnic-person"><b>'+esc(person.name)+'</b><span>'+esc(designation)+'</span></div><table class="cnic-grid"><tbody>'+rows+'</tbody></table></article>';
  });
  const groups=[];for(let i=0;i<cards.length;i+=9)groups.push(cards.slice(i,i+9));
  const pages=groups.map(group=>'<section class="cnic-sheet">'+group.join('')+Array(Math.max(0,9-group.length)).fill('<div class="cnic-blank"></div>').join('')+'</section>');
  const w=window.open('','_blank');if(!w){toast('Allow pop-ups to print the PDF');return}
  w.document.open();w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Teacher CNIC-size Timetables</title><style>
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif}
.cnic-sheet{width:297mm;height:210mm;padding:20mm 16.1mm;display:grid;grid-template-columns:repeat(3,85.6mm);grid-template-rows:repeat(3,54mm);gap:4mm;page-break-after:always;break-after:page;overflow:hidden}
.cnic-sheet:last-child{page-break-after:auto;break-after:auto}
.cnic-card{width:85.6mm;height:54mm;border:.35mm solid #152b49;border-radius:2.2mm;overflow:hidden;background:#fff;display:flex;flex-direction:column;break-inside:avoid}
.cnic-head{height:9mm;min-height:9mm;background:#12315c;color:#fff;display:grid;grid-template-columns:8mm 1fr 17mm;align-items:center;padding:0 1.2mm;gap:1mm}
.cnic-seal{width:6.5mm;height:6.5mm;border:.35mm solid #fff;border-radius:50%;display:grid;place-items:center;font:bold 4pt Georgia,serif}
.cnic-school{text-align:center;font:bold 5.3pt Arial,sans-serif;line-height:1.05}
.cnic-school b{display:block;font-size:5.8pt;letter-spacing:.2px;margin-top:.5mm}
.cnic-effective{text-align:center;font-size:4pt;line-height:1.05;border-left:.2mm solid #fff;padding-left:.8mm}
.cnic-effective b{display:block;font-size:4.5pt;margin-top:.5mm}
.cnic-person{height:5mm;min-height:5mm;display:flex;align-items:center;justify-content:space-between;padding:0 1.3mm;background:#eaf1fa;border-bottom:.2mm solid #152b49;gap:1mm}
.cnic-person b{font:bold 6.2pt Arial,sans-serif;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.cnic-person span{font:4.4pt Arial,sans-serif;white-space:nowrap}
.cnic-grid{width:100%;height:39mm;border-collapse:collapse;table-layout:fixed}
.cnic-grid th,.cnic-grid td{border:.18mm solid #333;padding:0;overflow:hidden}
.cnic-grid tbody tr{height:6.45mm}
.cnic-grid tbody th.mini-day{width:7mm;background:#eaf1fa;text-align:center;vertical-align:middle;font:bold 4.5pt Arial,sans-serif}
.cnic-grid tbody td{vertical-align:middle}
.mini-track{height:100%;width:100%;display:flex;align-items:stretch}
.mini-period{flex:1 1 0;min-width:0;border-right:.15mm solid #aaa;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:.1mm;overflow:hidden}
.mini-period>b{font:bold 3.7pt Arial,sans-serif;color:#17365f}
.mini-period>i{font:2.55pt Arial,sans-serif;font-style:normal;line-height:1.0;margin:.1mm 0}
.mini-period>strong{font:bold 3.15pt Arial,sans-serif;line-height:1.02;overflow-wrap:anywhere}
.mini-period>small{font:2.8pt Arial,sans-serif;line-height:1.0;overflow-wrap:anywhere}
.mini-period>em{font:4pt Arial,sans-serif;color:#aaa;font-style:normal}
.mini-break{width:6mm;flex:0 0 6mm;background:#f6e5bd;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border-right:.15mm solid #aaa}
.mini-break>b{font:bold 3.1pt Arial,sans-serif}
.mini-break>small{font:2.55pt Arial,sans-serif;line-height:1.05}
@page{size:A4 landscape;margin:0}
@media print{.cnic-sheet{page-break-after:always}.cnic-sheet:last-child{page-break-after:auto}}
</style></head><body>${pages.join('')}</body></html>`);
  w.document.close();w.focus();setTimeout(()=>w.print(),700);return;
 }

 const pages=people.map(person=>{
  const relevant=kind==='class'?slots.filter(x=>x.classId===person.id):slots.filter(x=>slotTeacherIds(x).some(id=>String(id)===String(person.id)));
  if(!relevant.length)return '';
  if(kind==='class'){
   const weekday=scheduleForDay(s,'Monday'),before=weekday.beforeBreak||[],after=weekday.afterBreak||[],periods=[...before,...after];
   const headers=periods.map((p,i)=>'<th><b>Period – '+(i+1)+'</b><small>'+esc(p.start)+' – '+esc(p.end)+'</small></th>');
   headers.splice(before.length,0,'<th class="break-head"><b>Break</b><small>'+esc(weekday.breakStart)+' – '+esc(weekday.breakEnd)+'</small></th>');
   const rows=days.map(day=>{
    const sc=scheduleForDay(s,day),pre=sc.beforeBreak||[],post=sc.afterBreak||[],allPeriods=[...pre,...post],isFriday=day==='Friday';
    const startTime=allPeriods[0]?.start||'09:00',offTime=sc.offTime||'14:00';
    const fmt=t=>{const [h,m]=t.split(':').map(Number),ampm=h>=12?'PM':'AM',hh=h%12||12;return String(hh).padStart(2,'0')+':'+String(m).padStart(2,'0')+' '+ampm};
    const cell=(i)=>{const x=relevant.find(z=>z.day===day&&z.period===i+1),p=allPeriods[i],time=isFriday&&p?'<small>'+esc(p.start)+' – '+esc(p.end)+'</small>':'';return x?'<td>'+time+'<b>'+esc(x.subjectName)+'</b><small>'+esc(slotTeacherNames(x,teachers))+'</small></td>':'<td class="empty-cell">—</td>'};
    const br='<td class="break-cell"><span>☕<b>Break</b><small>'+esc(sc.breakStart)+' – '+esc(sc.breakEnd)+'</small></span></td>';
    let cells='';
    if(isFriday){
     cells=pre.map((p,i)=>cell(i)).join('')+br+post.map((p,i)=>cell(pre.length+i)).join('');
     if(post.length<3)cells+='<td class="off-cell" colspan="'+(4-post.length)+'"><b>OFF</b><small>('+esc(fmt(offTime))+')</small></td>';
    }else{
     cells=pre.map((p,i)=>cell(i)).join('')+br+post.map((p,i)=>cell(pre.length+i)).join('');
    }
    return '<tr><th class="day-cell">'+esc(day)+'</th><td class="time-cell">'+esc(fmt(startTime))+' – '+esc(fmt(offTime))+'</td>'+cells+'</tr>';
   }).join('');
   return '<section class="print-page approved-print-page"><header class="approved-print-header"><div class="approved-print-emblem">GHSS</div><div class="approved-print-school"><h1>'+esc(s.schoolName||'Government Higher Secondary School')+'</h1><div class="approved-print-title">Class '+esc(person.name)+' – Time Table</div></div><div class="approved-print-effective">Effective From:<b>21 October 2026</b></div></header><table class="approved-print-table"><thead><tr><th>Day</th><th>Time</th>'+headers.join('')+'</tr></thead><tbody>'+rows+'</tbody></table></section>';
  }
  const header='Teacher '+person.name;
  const dayTables=days.map(day=>{const sc=scheduleForDay(s,day),before=sc.beforeBreak||[],after=sc.afterBreak||[],periods=[...before,...after];
   const thCells=periods.map(p=>'<th><b>'+esc(p.name)+'</b><small>'+esc(p.start)+'–'+esc(p.end)+'</small></th>');thCells.splice(before.length,0,'<th class="break-head">Break</th>');
   const cells=periods.map((p,i)=>{const x=relevant.find(z=>z.day===day&&z.period===i+1);if(!x)return '<td></td>';return '<td><small>Class - '+esc(x.className)+'</small><b>'+esc(x.subjectName)+'</b></td>'});
   cells.splice(before.length,0,'<td class="break-cell"><span>BREAK<br>'+esc(sc.breakStart)+'–'+esc(sc.breakEnd)+'</span></td>');
   return '<h2>'+esc(day)+'</h2><table class="print-table"><thead><tr>'+thCells.join('')+'</tr></thead><tbody><tr>'+cells.join('')+'</tr></tbody></table>';
  }).join('');
  return '<section class="print-page"><h1>'+esc(header)+'</h1>'+dayTables+'<div class="print-footer">TimeCraft · '+new Date().toLocaleDateString('en-GB')+'</div></section>';
 }).filter(Boolean);
 const w=window.open('','_blank');if(!w){toast('Allow pop-ups to print the PDF');return}
 w.document.open();w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>TimeCraft ${kind} timetable</title><style>
*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}
.print-page{width:100%;min-height:210mm;padding:5mm 5mm;page-break-after:always;break-after:page}.print-page:last-child{page-break-after:auto;break-after:auto}
.approved-print-header{height:28mm;border:1.4px solid #111;border-radius:3mm;display:grid;grid-template-columns:22mm 1fr 42mm;align-items:center;padding:2mm 4mm;margin-bottom:2mm;gap:3mm}
.approved-print-emblem{width:18mm;height:18mm;border:1.5px solid #111;border-radius:50%;display:flex;align-items:center;justify-content:center;font:bold 11pt Georgia,serif}
.approved-print-school{text-align:center}.approved-print-school h1{font: bold 23pt Georgia,serif;margin:0 0 2mm;border-bottom:1px solid #777;padding-bottom:1mm}
.approved-print-title{display:inline-block;background:#e1e1e1;border-radius:9mm;padding:1mm 9mm;font:bold 17pt Georgia,serif}
.approved-print-effective{text-align:center;border:1px solid #222;border-radius:2mm;padding:2mm;font: bold 9pt Georgia,serif}.approved-print-effective b{display:block;margin-top:1mm}
.approved-print-table{border-collapse:collapse;width:100%;table-layout:fixed}.approved-print-table th,.approved-print-table td{border:1px solid #111;text-align:center;vertical-align:middle;padding:1mm .6mm}
.approved-print-table thead th{height:13mm;background:#ededed;font:bold 11pt Georgia,serif}.approved-print-table thead small{display:block;font: bold 8pt Arial;margin-top:1mm}
.approved-print-table tbody th.day-cell{font:bold 13pt Georgia,serif;background:#f1f1f1;width:10%}
.approved-print-table .time-cell{font:bold 7.5pt Arial;width:8%}
.approved-print-table tbody td{height:19mm;font: bold 10pt Georgia,serif}
.approved-print-table td b{display:block;font:bold 10.5pt Georgia,serif}.approved-print-table td small{display:block;font:9pt Arial,sans-serif;margin-top:1mm;line-height:1.12}
.approved-print-table .break-cell{background:#e5e5e5}.approved-print-table .break-cell span{display:block;font:bold 9pt Georgia,serif}.approved-print-table .break-cell small{font:7pt Arial}
.approved-print-table .off-cell{background:#e5e5e5;font:bold 16pt Georgia,serif}.approved-print-table .empty-cell{color:#aaa}
.print-table{border-collapse:collapse;width:100%;table-layout:fixed;margin-bottom:2mm}.print-table th,.print-table td{border:1px solid #222;text-align:center;vertical-align:middle;padding:2px}.print-table thead th{height:10mm;font-size:8pt}.print-table th small{display:block;font-size:6.5pt;font-weight:400;margin-top:2px}.print-table tbody td{height:13mm;font-size:8pt}.print-table td b{display:block;font-size:8pt}.print-table td small{display:block;font-size:6.5pt;margin-top:2px}.break-cell{width:7%;background:#f5f5f5}.break-cell span{font-size:6.5pt;writing-mode:vertical-rl;transform:rotate(180deg);display:inline-block}
@page{size:A4 landscape;margin:0}@media print{.print-page{break-after:page}.print-page:last-child{break-after:auto}}
</style></head><body>${pages.join('')}</body></html>`);
 w.document.close();w.focus();setTimeout(()=>w.print(),700);
}

async function backup(){const data={app:'TimeCraft',version:1,exportedAt:new Date().toISOString(),records:{}};for(const s of stores)data.records[s]=await all(s);const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='timecraft-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(url);toast('Backup downloaded')}
async function restore(file){const data=JSON.parse(await file.text());if(data.app!=='TimeCraft'||!data.records)throw new Error('This is not a valid TimeCraft backup');const tx=db.transaction(stores,'readwrite');for(const s of stores){const st=tx.objectStore(s);st.clear();(data.records[s]||[]).forEach(x=>st.put(x))}await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});toast('Backup restored');render()}
async function resetAll(){if(!confirm('Clear every TimeCraft record on this device? This cannot be undone.'))return;const tx=db.transaction(stores,'readwrite');stores.forEach(s=>tx.objectStore(s).clear());await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});toast('Workspace cleared');setView('dashboard')}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;try{
 if(a.startsWith('goto-'))setView(a.slice(5));
 else if(a==='add-teachers'||a==='add-classes'||a==='add-subjects')editForm(a.slice(4));
 else if(a.startsWith('edit-slot-'))await editSlot(a.slice(10));
 else if(a.startsWith('edit-')){const p=a.split('-');await editForm(p[1],p.slice(2).join('-'))}
 else if(a.startsWith('delete-fixture-')){if(confirm('Delete this fixture record?')){await del('fixtures',a.slice(15));toast('Fixture deleted');render()}}
 else if(a.startsWith('delete-')){const p=a.split('-');if(confirm('Delete this record?')){await del(p[1],p.slice(2).join('-'));toast('Deleted');render()}}
 else if(a==='close-modal')$('.modal-backdrop')?.remove();
 else if(a.startsWith('add-period-')){const group=a.slice(11),list=document.querySelector('[data-period-group="'+group+'"]');if(list){const count=list.querySelectorAll('.period-row').length+1,row=document.createElement('div');row.className='period-row';row.innerHTML='<input aria-label="Period name" data-period-name value="P'+count+'" placeholder="P'+count+'"><label>From<input type="time" data-period-start value="09:00"></label><label>To<input type="time" data-period-end value="10:00"></label><button type="button" class="btn danger small" data-action="remove-period">Remove</button>';list.appendChild(row)}}
 else if(a==='remove-period'){const row=b.closest('.period-row'),list=b.closest('.period-list');if(list.querySelectorAll('.period-row').length<=1){toast('At least one period is required in each section');return}row.remove()}
 else if(a==='generate')await generateTimetable();
 else if(a==='new-fixture')await createFixture();
 else if(a==='auto-fixtures')await autoAssignFixtures();
 else if(a.startsWith('manual-fixture-'))await manualFixture(a.slice(15));
 else if(a==='fixture-report'){const [fixtures,teachers,slots,settings]=await Promise.all([all('fixtures'),all('teachers'),all('slots'),setting()]);const date=$('#fixtureDate')?.value||new Date().toISOString().slice(0,10);downloadFixtureReport(date,fixtures,teachers,slots,settings);}
 else if(a==='backup')await backup();
 else if(a==='reset')await resetAll();
 else if(a==='print-class')await printTimetables('class');
 else if(a==='print-teacher')await printTimetables('teacher');
 else if(a==='print')window.print();
 }catch(err){console.error(err);toast(err.message||'Action failed')}
});
document.addEventListener('change',e=>{if(e.target.id==='classFilter'){selectedTimetableClassId=Number(e.target.value)||null;render();}if(e.target.id==='restoreFile'&&e.target.files[0])restore(e.target.files[0]).catch(err=>toast(err.message));if(e.target.name==='date'){const day=e.target.closest('form')?.querySelector('[name="day"]');if(day){const d=new Date(e.target.value+'T12:00:00');if(!isNaN(d))day.value=DAYS[(d.getDay()+6)%7]}}});
function readSchedule(form,key){const val=n=>form.querySelector('[name="'+key+'-'+n+'"]').value;const rows=g=>Array.from(form.querySelectorAll('[data-period-group="'+key+'-'+g+'"] .period-row')).map(r=>({name:r.querySelector('[data-period-name]').value.trim(),start:r.querySelector('[data-period-start]').value,end:r.querySelector('[data-period-end]').value}));return {assemblyStart:val('assemblyStart'),assemblyEnd:val('assemblyEnd'),breakStart:val('breakStart'),breakEnd:val('breakEnd'),offTime:val('offTime'),breakEnabled:form.querySelector('[name="'+key+'-breakEnabled"]').checked,assemblyEnabled:form.querySelector('[name="'+key+'-assemblyEnabled"]').checked,beforeBreak:rows('before'),afterBreak:rows('after')}}
function validSchedule(sc,label){const m=t=>{const [h,n]=t.split(':').map(Number);return h*60+n};if(!sc.offTime)throw new Error(label+': school off-time zaroor set karein');if(sc.assemblyEnabled&&(!sc.assemblyStart||!sc.assemblyEnd||m(sc.assemblyStart)>=m(sc.assemblyEnd)))throw new Error(label+': assembly timing check karein');if(sc.breakEnabled&&(!sc.breakStart||!sc.breakEnd||m(sc.breakStart)>=m(sc.breakEnd)))throw new Error(label+': break timing check karein');const periods=[...(sc.beforeBreak||[]),...(sc.afterBreak||[])];if(!periods.length)throw new Error(label+': kam az kam aik period add karein');let prev=sc.assemblyEnabled?m(sc.assemblyEnd):-1;for(let i=0;i<periods.length;i++){const p=periods[i];if(!p.name||!p.start||!p.end||m(p.start)>=m(p.end)||m(p.start)<prev||m(p.end)>m(sc.offTime))throw new Error(label+': period '+(i+1)+' ka time/order check karein');if(sc.breakEnabled&&i<(sc.beforeBreak||[]).length&&m(p.end)>m(sc.breakStart))throw new Error(label+': break se pehle wala period break se overlap kar raha hai');if(sc.breakEnabled&&i===(sc.beforeBreak||[]).length&&m(p.start)<m(sc.breakEnd))throw new Error(label+': break ke baad period break end ke baad start hona chahiye');prev=m(p.end)}if(sc.assemblyEnabled&&periods.length&&m(periods[0].start)<m(sc.assemblyEnd))throw new Error(label+': first period assembly ke baad start hona chahiye');if(sc.breakEnabled&&sc.beforeBreak.length&&m(sc.beforeBreak.at(-1).end)>m(sc.breakStart))throw new Error(label+': break se pehle ke periods check karein');if(sc.breakEnabled&&sc.afterBreak.length&&m(sc.afterBreak[0].start)<m(sc.breakEnd))throw new Error(label+': break ke baad ke periods check karein');return true}
document.addEventListener('submit',async e=>{if(e.target.id==='settingsForm'){e.preventDefault();try{const f=e.target,weekday=readSchedule(f,'weekday'),friday=readSchedule(f,'Friday');validSchedule(weekday,'Monday–Thursday & Saturday');validSchedule(friday,'Friday');const shared=JSON.parse(JSON.stringify(weekday)),daySchedules={Monday:shared,Tuesday:JSON.parse(JSON.stringify(shared)),Wednesday:JSON.parse(JSON.stringify(shared)),Thursday:JSON.parse(JSON.stringify(shared)),Friday:friday,Saturday:JSON.parse(JSON.stringify(shared))};const v={schoolName:f.elements.schoolName.value||'My School',workingDays:Array.from(f.querySelectorAll('[name="days"]:checked')).map(x=>x.value),daySchedules};await saveSetting(v);toast('Shared weekday and separate Friday timings saved');render()}catch(err){toast(err.message)}}});document.addEventListener('change',async e=>{if(e.target.matches('.assignment-select')){const classId=Number(e.target.dataset.mapClass),subjectId=Number(e.target.dataset.mapSubject),idx=Number(e.target.dataset.mapIndex),maps=await all('teachingAssignments'),existing=maps.find(x=>x.classId===classId&&x.subjectId===subjectId),row=e.target.closest('td'),pickers=[...row.querySelectorAll('.assignment-select')],ids=pickers.map(x=>Number(x.value)).filter(Boolean);if(new Set(ids).size!==ids.length){toast('Same teacher cannot be selected twice');return}if(existing){if(ids.length)await put('teachingAssignments',{...existing,teacherIds:ids,teacherId:ids[0]});else await del('teachingAssignments',existing.id)}else if(ids.length)await add('teachingAssignments',{classId,subjectId,teacherIds:ids,teacherId:ids[0]});toast('Teacher assignment saved');render()}});
document.addEventListener('submit',async e=>{if(e.target.id==='manualAssignForm'){e.preventDefault();try{await saveManualAssignment(e.target)}catch(err){console.error(err);toast(err.message||'Could not assign period')}}});
async function init(){try{db=await openDB();const s=await all('settings');if(!s.length)await put('settings',{...defaults,id:1});nav();render()}catch(e){$('#appContent').innerHTML=empty('Local storage unavailable','Please open TimeCraft in a modern browser with IndexedDB enabled.');console.error(e)}}
init();
})();

(() => {
  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const teams = ["과장", "농업정책팀", "친환경농업팀", "농지허가팀", "농업유통팀", "로컬푸드팀", "기반조성팀"];
  let sb = null, employees = [], activeSurvey = null, questions = [], editingEmployeeId = null;

  function msg(text, type="ok"){
    const el=$("message"); el.className="card "+(type==="err"?"err":"ok"); el.textContent=text; el.classList.remove("hidden");
    setTimeout(()=>el.classList.add("hidden"),3500);
  }
  function configured(){
    return cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR_PROJECT") &&
      cfg.SUPABASE_PUBLISHABLE_KEY && !cfg.SUPABASE_PUBLISHABLE_KEY.includes("REPLACE_ME");
  }
  if(configured()) sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);

  function fillTeams(){
    for(const id of ["teamSelect","empTeam"]) $(id).innerHTML=teams.map(t=>`<option value="${t}">${t}</option>`).join("");
  }

  async function loadEmployees(){
    if(!sb) return;
    const {data,error}=await sb.from("employees").select("id,team,name").order("team").order("name");
    if(error){msg(error.message,"err");return;}
    employees=data||[];
    $("adminEmployeeCount").textContent=employees.length+"명";
    renderEmployeeSelect();
    renderEmployeeAdmin();
  }

  function renderEmployeeSelect(){
    const team=$("teamSelect").value||teams[0];
    const rows=employees.filter(e=>e.team===team);
    $("employeeSelect").innerHTML=rows.map(e=>`<option value="${e.id}">${e.name}</option>`).join("");
  }

  function renderEmployeeAdmin(){
    $("employeeAdminList").innerHTML=teams.map(team=>{
      const rows=employees.filter(e=>e.team===team);
      return `<div style="margin-top:14px"><h3>${team}</h3>${rows.length?rows.map(e=>`
        <div class="item"><span>${e.name}</span><span>
          <button class="editEmp" data-id="${e.id}">수정</button>
          <button class="delEmp danger" data-id="${e.id}">삭제</button>
        </span></div>`).join(""):'<div class="muted">직원 없음</div>'}</div>`;
    }).join("");
    document.querySelectorAll(".editEmp").forEach(b=>b.onclick=()=>openEmployeeEditor(b.dataset.id));
    document.querySelectorAll(".delEmp").forEach(b=>b.onclick=()=>deleteEmployee(b.dataset.id));
  }

  function openEmployeeEditor(id=null){
    editingEmployeeId=id;
    const e=employees.find(x=>x.id===id);
    $("employeeEditorTitle").textContent=e?"직원 수정":"직원 추가";
    $("empTeam").value=e?e.team:"1팀"; $("empName").value=e?e.name:"";
    $("employeeEditor").classList.remove("hidden");
  }
  async function saveEmployee(){
    const team=$("empTeam").value, name=$("empName").value.trim();
    if(!name) return msg("이름을 입력하세요.","err");
    const q=editingEmployeeId
      ? sb.from("employees").update({team,name}).eq("id",editingEmployeeId)
      : sb.from("employees").insert({team,name});
    const {error}=await q;
    if(error) return msg(error.message,"err");
    $("employeeEditor").classList.add("hidden"); editingEmployeeId=null;
    await loadEmployees(); msg("직원 명단을 저장했습니다.");
  }
  async function deleteEmployee(id){
    const e=employees.find(x=>x.id===id);
    if(!e || !confirm(`${e.team} ${e.name} 직원을 실제 DB에서 삭제할까요?`)) return;
    const {error}=await sb.from("employees").delete().eq("id",id);
    if(error) return msg(error.message,"err");
    await loadEmployees(); msg("직원을 삭제했습니다.");
  }

  async function loadStaffSurvey(){
    if(!sb) {
      $("surveyTitle").textContent="설정이 필요합니다";
      $("surveyDesc").textContent="config.js에 Supabase URL과 publishable key를 입력하세요.";
      return;
    }
    const id=new URLSearchParams(location.search).get("survey");
    if(!id) return;
    const {data:s,error}=await sb.from("surveys").select("*").eq("id",id).eq("is_open",true).maybeSingle();
    if(error || !s){ $("surveyTitle").textContent="조사를 찾을 수 없습니다"; $("surveyClosed").classList.remove("hidden"); return; }
    activeSurvey=s;
    const {data:q,error:qe}=await sb.from("questions").select("*").eq("survey_id",id).order("sort_order");
    if(qe) return msg(qe.message,"err");
    questions=q||[];
    $("surveyTitle").textContent=s.title; $("surveyDesc").textContent=s.description||"";
    $("responseForm").classList.remove("hidden");
    renderQuestions();
  }

  function renderQuestions(){
    $("questionsBox").innerHTML=questions.map((q,idx)=>{
      const opts=Array.isArray(q.options)?q.options:[];
      if(q.answer_type==="text") return `<div class="field"><label>${idx+1}. ${q.question_text}</label><textarea data-q="${q.id}" data-type="text" rows="3"></textarea></div>`;
      const type=q.answer_type==="multi"?"checkbox":"radio";
      return `<div class="field"><label>${idx+1}. ${q.question_text}</label>${opts.map(o=>`
        <label class="option"><input type="${type}" name="q_${q.id}" data-q="${q.id}" data-type="${q.answer_type}" value="${String(o).replaceAll('"','&quot;')}">${o}</label>`).join("")}</div>`;
    }).join("");
  }

  function collectAnswers(){
    const answers=[];
    for(const q of questions){
      if(q.answer_type==="text"){
        const el=document.querySelector(`[data-q="${q.id}"][data-type="text"]`);
        answers.push({question_id:q.id,answer:el.value.trim()});
      } else if(q.answer_type==="multi"){
        const vals=[...document.querySelectorAll(`input[data-q="${q.id}"]:checked`)].map(x=>x.value);
        answers.push({question_id:q.id,answer:vals});
      } else {
        const el=document.querySelector(`input[data-q="${q.id}"]:checked`);
        answers.push({question_id:q.id,answer:el?el.value:""});
      }
    }
    return answers;
  }

  async function submitResponses(e){
    e.preventDefault();
    const employee_id=$("employeeSelect").value;
    if(!employee_id) return msg("직원을 선택하세요.","err");
    const answers=collectAnswers();
    if(answers.some(a=>a.answer==="" || (Array.isArray(a.answer)&&!a.answer.length))) return msg("모든 질문에 답해주세요.","err");
    const {error}=await sb.rpc("submit_survey_response",{p_survey_id:activeSurvey.id,p_employee_id:employee_id,p_answers:answers});
    if(error) return msg(error.message,"err");
    $("responseDone").classList.remove("hidden"); msg("응답을 저장했습니다.");
  }

  async function adminLogin(){
    if(!sb) return msg("config.js 설정이 먼저 필요합니다.","err");
    const email=$("adminEmail").value.trim(), password=$("adminPassword").value;
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error) return msg("로그인 실패: "+error.message,"err");
    await showAdminApp();
  }
  async function showAdminApp(){
    $("loginCard").classList.add("hidden"); $("adminApp").classList.remove("hidden");
    await loadEmployees(); await loadSurveyList();
  }
  async function loadSurveyList(){
    const {data,error}=await sb.from("surveys").select("*").order("created_at",{ascending:false});
    if(error) return msg(error.message,"err");
    const list=data||[];
    $("adminSurveyCount").textContent=list.filter(s=>s.is_open).length+"건";
    $("surveyList").innerHTML=list.length?list.map(s=>`
      <div class="item"><div><strong>${s.title}</strong><br><span class="muted">${s.is_open?"진행 중":"마감"}</span></div>
      <span><button class="viewSurvey" data-id="${s.id}">현황</button> <button class="copySurvey" data-id="${s.id}">링크</button><button class="deleteSurvey danger" data-id="${s.id}">삭제</button></span></div>`).join(""):'<div class="muted">아직 조사가 없습니다.</div>';
    document.querySelectorAll(".viewSurvey").forEach(b=>b.onclick=()=>loadSurveyDetail(b.dataset.id));
    document.querySelectorAll(".copySurvey").forEach(b=>b.onclick=()=>copySurveyLink(b.dataset.id));
    document.querySelectorAll(".deleteSurvey").forEach(b=>b.onclick=()=>deleteSurvey(b.dataset.id));
  }
  async function copySurveyLink(id){
    const url=`${location.origin}${location.pathname}?survey=${id}`;
    try{ await navigator.clipboard.writeText(url); msg("공유 링크를 복사했습니다."); }
    catch{ prompt("아래 링크를 복사하세요.",url); }
  }

  async function loadSurveyDetail(id){
    const [sres,rres,qres]=await Promise.all([
      sb.from("surveys").select("*").eq("id",id).single(),
      sb.from("responses").select("employee_id,question_id,answer").eq("survey_id",id),
      sb.from("questions").select("*").eq("survey_id",id).order("sort_order")
    ]);
    if(sres.error||rres.error||qres.error) return msg((sres.error||rres.error||qres.error).message,"err");
    const survey=sres.data, rs=rres.data||[], qs=qres.data||[];
    const responded=new Set(rs.map(r=>r.employee_id));
    const missing=employees.filter(e=>!responded.has(e.id));
    let aggregate="";
    for(const q of qs){
      if(q.answer_type==="text") continue;
      const counts={}; (q.options||[]).forEach(o=>counts[o]=0);
      rs.filter(r=>r.question_id===q.id).forEach(r=>{
        if(Array.isArray(r.answer)) r.answer.forEach(v=>counts[v]=(counts[v]||0)+1);
        else counts[r.answer]=(counts[r.answer]||0)+1;
      });
      aggregate+=`<h3 style="margin-top:14px">${q.question_text}</h3><table>${Object.entries(counts).map(([k,v])=>`<tr><td>${k}</td><td>${v}명</td></tr>`).join("")}</table>`;
    }
    $("surveyDetail").innerHTML=`
      <div class="row"><h2 class="grow">${survey.title}</h2><button id="toggleSurveyBtn">${survey.is_open?"조사 마감":"다시 열기"}</button></div>
      <p>응답 <strong>${responded.size}</strong> / ${employees.length}명 · 미응답 ${missing.length}명</p>
      <h3>미응답자</h3>
      <p>${missing.length?teams.map(t=>{const ns=missing.filter(e=>e.team===t).map(e=>e.name);return ns.length?`<strong>${t}</strong> ${ns.join(", ")}`:""}).filter(Boolean).join("<br>"):"전원 응답 완료"}</p>
      ${aggregate || '<p class="muted">선택형 질문 집계가 없습니다.</p>'}`;
    $("surveyDetail").classList.remove("hidden");
    $("toggleSurveyBtn").onclick=async()=>{
      const {error}=await sb.from("surveys").update({is_open:!survey.is_open}).eq("id",id);
      if(error) return msg(error.message,"err"); await loadSurveyList(); await loadSurveyDetail(id);
    };
  }

  async function createSurvey(e){
    e.preventDefault();
    const title=$("newSurveyTitle").value.trim(), description=$("newSurveyDesc").value.trim(), end_date=$("newSurveyEnd").value||null;
    const qtext=$("q1Text").value.trim(), qtype=$("q1Type").value;
    const options=qtype==="text"?[]:$("q1Options").value.split(",").map(x=>x.trim()).filter(Boolean);
    if(!title||!qtext) return msg("조사 제목과 질문을 입력하세요.","err");
    const {data:s,error}=await sb.from("surveys").insert({title,description,end_date,is_open:true}).select().single();
    if(error) return msg(error.message,"err");
    const {error:qe}=await sb.from("questions").insert({survey_id:s.id,question_text:qtext,answer_type:qtype,options,sort_order:1});
    if(qe) return msg(qe.message,"err");
    await loadSurveyList(); switchTab("dashboard"); copySurveyLink(s.id);
  }
    async function deleteSurvey(id){
  const surveyName =
    document.querySelector(`.deleteSurvey[data-id="${id}"]`)
      ?.closest(".item")
      ?.querySelector("strong")
      ?.textContent || "이 조사";

  if(!confirm(
    `${surveyName}을(를) 삭제하시겠습니까?\n\n` +
    `조사와 해당 응답자료가 함께 삭제됩니다.\n` +
    `삭제 후에는 복구할 수 없습니다.`
  )) return;

  const { error } = await sb
    .from("surveys")
    .delete()
    .eq("id", id);

  if(error){
    return msg("조사 삭제 실패: " + error.message, "err");
  }

  $("surveyDetail").classList.add("hidden");
  await loadSurveyList();
     msg("조사를 삭제했습니다.");
  }

  function switchTab(name){
    document.querySelectorAll(".tabpane").forEach(x=>x.classList.add("hidden"));
    $("tab-"+name).classList.remove("hidden");
    document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x.dataset.tab===name));
  }

  $("adminEntryBtn").onclick=()=>{$("staffSection").classList.add("hidden");$("adminSection").classList.remove("hidden");};
  $("backStaffBtn").onclick=()=>{$("adminSection").classList.add("hidden");$("staffSection").classList.remove("hidden");};
  $("loginBtn").onclick=adminLogin;
  $("logoutBtn").onclick=async()=>{await sb.auth.signOut();$("adminApp").classList.add("hidden");$("loginCard").classList.remove("hidden");};
  $("teamSelect").onchange=renderEmployeeSelect;
  $("responseForm").onsubmit=submitResponses;
  $("addEmployeeBtn").onclick=()=>openEmployeeEditor();
  $("saveEmployeeBtn").onclick=saveEmployee;
  $("cancelEmployeeBtn").onclick=()=>{$("employeeEditor").classList.add("hidden");editingEmployeeId=null;};
  $("surveyCreateForm").onsubmit=createSurvey;
  $("q1Type").onchange=()=>$("q1OptionsField").classList.toggle("hidden",$("q1Type").value==="text");
  document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));

  fillTeams();
  loadEmployees();
  loadStaffSurvey();
  if(sb) sb.auth.getSession().then(({data})=>{ if(data.session){$("staffSection").classList.add("hidden");$("adminSection").classList.remove("hidden");showAdminApp();} });
})();

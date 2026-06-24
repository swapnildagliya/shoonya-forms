// Deterministic fill + payload-capture for the weekly-classes form.
// Run via the Preview MCP preview_eval against http://localhost:4188/smart-form/weekly-classes.html?test=1
// (reload the page first for a clean state). Returns { fill, capturedKeys, payload }.
// The returned `payload` MUST deep-equal weekly-golden-payload.json (order-independent)
// after the form-kernel migration — that's the migration's acceptance test.
(async () => {
  const setV=(id,v)=>{const e=document.getElementById(id);if(e){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}return !!e;};
  const clickByText=(sel,re)=>{const c=[...document.querySelectorAll(sel)].find(x=>re.test(x.textContent));if(c)c.click();return !!c;};
  const log={};
  const loginProfile={name:'ZZ QA Kernel Teacher',email:'swapkebolly@gmail.com',dance_styles:'["Dance & Fit"]'};
  localStorage.setItem('shoonya_session',JSON.stringify({profile:loginProfile,token:'test-token'}));
  window.dispatchEvent(new CustomEvent('shoonya:login',{detail:loginProfile}));
  log.name=document.getElementById('f-teacher-name')?.value===loginProfile.name;
  log.email=document.getElementById('f-teacher-email')?.value===loginProfile.email;
  log.style=clickByText('#style-chips .chip',/^\s*Dance & Fit\s*$/);
  await new Promise(r=>setTimeout(r,120));
  log.level=clickByText('#level-chips-wrap .chip',/open level/i);
  await new Promise(r=>setTimeout(r,150));
  const daySel=document.querySelector('#level-cards select');
  if(daySel){const mon=[...daySel.options].find(o=>/mon/i.test(o.textContent)||/mon/i.test(o.value)); daySel.value=mon?mon.value:daySel.options[1]?.value; daySel.dispatchEvent(new Event('change',{bubbles:true}));}
  const t=document.querySelectorAll('#level-cards input[type="time"]');
  if(t[0]){t[0].value='18:00';t[0].dispatchEvent(new Event('input',{bubbles:true}));}
  if(t[1]){t[1].value='19:00';t[1].dispatchEvent(new Event('input',{bubbles:true}));}
  setV('f-description','ZZ QA kernel description.'); setV('f-prereq','None.'); setV('f-bring','Water.');
  setV('f-max-students','12'); setV('f-dropin-price','10'); setV('f-website-note','ZZ QA website note.');
  setV('f-special-notes','ZZ QA NOTE FOR SHOONYA kernel.');
  const dcb=document.getElementById('dropin-cb'); if(dcb&&!dcb.checked){dcb.checked=true;dcb.dispatchEvent(new Event('change',{bubbles:true}));}
  window.__cap=null; const of=window.fetch;
  window.fetch=function(u,o){try{window.__cap=JSON.parse(o.body);}catch(e){window.__cap={err:String(e)};}return Promise.resolve(new Response(JSON.stringify({ok:true,testMode:true,preview:{}}),{status:200,headers:{'Content-Type':'application/json'}}));};
  try{await submitForm();}catch(e){log.submitErr=String(e);}
  window.fetch=of;
  return {fill:log, capturedKeys: window.__cap?Object.keys(window.__cap).length:null, payload: window.__cap};
})()

(()=>{"use strict";let e={type:"loading"},t="",a=null,n=null;function s(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function r(){var a;let r,i,o,l=document.getElementById("app");if(!l)return;l.innerHTML=`<div class="body">${function(e){switch(e.type){case"loading":return`
        <div class="state-screen">
          <div class="spinner"></div>
          <p class="state-desc">Loading your meetings...</p>
        </div>
      `;case"no-permission":return`
        <div class="state-screen">
          <div class="state-icon">📅</div>
          <p class="state-title">Calendar Access Needed</p>
          <p class="state-desc">Google Meet needs access to your calendar to show upcoming events.</p>
          <button class="btn-primary" id="btn-grant" data-action="grant-access" ${e.retrying?"disabled":""}>
            ${e.retrying?"Requesting...":"Grant Access"}
          </button>
        </div>
      `;case"no-events":return`
        <div class="state-screen">
          <div class="state-icon">☕</div>
          <p class="state-title">No upcoming meetings</p>
          <p class="state-desc">No calendar events found for today or tomorrow.</p>
        </div>
      `;case"error":return`
        <div class="state-screen">
          <div class="state-icon">⚠️</div>
          <p class="state-title">Something went wrong</p>
          <p class="state-desc">${s(e.message)}</p>
          <button class="btn-primary" id="btn-retry" data-action="retry">Try Again</button>
        </div>
      `;case"has-events":{let t=Date.now(),a=e.events.filter(e=>new Date(e.endDate).getTime()>t),n=e.events.filter(e=>new Date(e.endDate).getTime()<=t),r="";return a.length>0&&(r+='<p class="section-header">Today & Tomorrow</p>',a.forEach((e,t)=>{let n=function(e){let t=Date.now(),a=new Date(e).getTime()-t,n=Math.round(a/6e4);if(a<0&&18e5>Math.abs(a))return{label:"In progress",cls:"now"};if(n<=0)return{label:"Ended",cls:""};if(n<1)return{label:"Starting now!",cls:"now"};if(n<=15)return{label:`In ${n} min`,cls:"soon"};let s=new Date(e),r=s.getHours().toString().padStart(2,"0"),i=s.getMinutes().toString().padStart(2,"0");return{label:`${r}:${i}`,cls:""}}(e.startDate),i=!e.isAllDay&&!!e.meetUrl;r+=`
            <div class="meeting-item">
              <div class="meeting-item-row">
                <span class="meeting-title" title="${s(e.title)}">${s(e.title)}</span>
                ${e.meetUrl?`<button class="btn-join" data-action="join-meeting" data-url="${s(e.meetUrl)}">Join</button>`:""}
              </div>
              <div class="meeting-item-row">
                <span class="meeting-time ${n.cls}">${n.label}</span>
                <span class="meeting-meta">
                  ${i?'<span class="badge-auto" title="Browser will open automatically 1 min before">⚡ Auto</span>':""}
                  <span class="meeting-cal">${s(e.calendarName)}</span>
                </span>
              </div>
            </div>
          `,t<a.length-1&&(r+='<div class="meeting-divider"></div>')})),n.length>0&&0===a.length&&(r+=`
          <div class="state-screen">
            <div class="state-icon">✅</div>
            <p class="state-title">All done for today!</p>
            <p class="state-desc">No more upcoming meetings.</p>
          </div>
        `),r}}}(e)}</div>`+(o=(r=null===n)?"Loading…":(a=n,(i=Math.floor((Date.now()-a)/6e4))<1?"Updated just now":1===i?"Updated 1 min ago":`Updated ${i} min ago`),`
    <footer class="footer">
      <span class="footer-version">v${t}</span>
      <span class="footer-sep" aria-hidden="true"></span>
      <button class="footer-refresh${r?" footer-refresh--loading":""}" data-action="refresh" aria-label="Refresh meetings">
        ${r?"":'<span class="footer-refresh-icon" aria-hidden="true">↻</span>'}<span class="footer-refresh-label">${o}</span>
      </button>
    </footer>
  `);let c=l.querySelector(".body"),d=Math.min(480,Math.max(220,(c?c.scrollHeight:0)+32));window.api.window.setHeight(d)}async function i(){e={type:"no-permission",retrying:!0},r(),"granted"===await window.api.calendar.requestPermission()?await o():(e={type:"no-permission",retrying:!1},r())}async function o(){e={type:"loading"},r();try{let t=await window.api.calendar.getPermissionStatus();if("denied"===t||"not-determined"===t){e={type:"no-permission",retrying:!1},r();return}let a=await window.api.calendar.getEvents();e="error"in a?{type:"error",message:a.error}:0===a.events.length?{type:"no-events"}:{type:"has-events",events:a.events}}catch(t){e={type:"error",message:t instanceof Error?t.message:"Unknown error"}}n=Date.now(),r()}async function l(){let e;(e=document.getElementById("app"))&&e.addEventListener("click",e=>{let t=e.target.closest("[data-action]");if(t)switch(t.dataset.action){case"refresh":case"retry":o();break;case"grant-access":i();break;case"join-meeting":{let e=t.dataset.url;e&&window.api.app.openExternal(e)}}}),t=await window.api.app.getVersion(),await o(),a&&clearInterval(a),a=setInterval(()=>o(),3e5),document.addEventListener("visibilitychange",()=>{document.hidden?a&&(clearInterval(a),a=null):(o(),a&&clearInterval(a),a=setInterval(()=>o(),3e5))})}document.addEventListener("DOMContentLoaded",()=>l())})();
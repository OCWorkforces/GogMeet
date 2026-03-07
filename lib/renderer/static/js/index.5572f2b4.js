(()=>{"use strict";let e={type:"loading"},t="",n=null;function s(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function a(){var n,a,l;let o=document.getElementById("app");o&&(o.innerHTML=`
    <div class="header">
    </div>
  <div class="body">${function(e){switch(e.type){case"loading":return`
        <div class="state-screen">
          <div class="spinner"></div>
          <p class="state-desc">Loading your meetings...</p>
        </div>
      `;case"no-permission":return`
        <div class="state-screen">
          <div class="state-icon">📅</div>
          <p class="state-title">Calendar Access Needed</p>
          <p class="state-desc">GiMeet needs access to your calendar to show upcoming events.</p>
          <button class="btn-primary" id="btn-grant" ${e.retrying?"disabled":""}>
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
          <button class="btn-primary" id="btn-retry">Try Again</button>
        </div>
      `;case"has-events":{let t=Date.now(),n=e.events.filter(e=>new Date(e.endDate).getTime()>t),a=e.events.filter(e=>new Date(e.endDate).getTime()<=t),i="";return n.length>0&&(i+='<p class="section-header">Today & Tomorrow</p>',n.forEach((e,t)=>{let a=function(e){let t=Date.now(),n=new Date(e).getTime()-t,s=Math.round(n/6e4);if(n<0&&18e5>Math.abs(n))return{label:"In progress",cls:"now"};if(s<=0)return{label:"Ended",cls:""};if(s<1)return{label:"Starting now!",cls:"now"};if(s<=15)return{label:`In ${s} min`,cls:"soon"};let a=new Date(e),i=a.getHours().toString().padStart(2,"0"),r=a.getMinutes().toString().padStart(2,"0");return{label:`${i}:${r}`,cls:""}}(e.startDate),r=!e.isAllDay&&!!e.meetUrl;i+=`
            <div class="meeting-item">
              <div class="meeting-item-row">
                <span class="meeting-title" title="${s(e.title)}">${s(e.title)}</span>
                ${e.meetUrl?`<button class="btn-join" data-url="${s(e.meetUrl)}">Join</button>`:""}
              </div>
              <div class="meeting-item-row">
                <span class="meeting-time ${a.cls}">${a.label}</span>
                <span class="meeting-meta">
                  ${r?'<span class="badge-auto" title="Browser will open automatically 1 min before">⚡ Auto</span>':""}
                  <span class="meeting-cal">${s(e.calendarName)}</span>
                </span>
              </div>
            </div>
          `,t<n.length-1&&(i+='<div class="meeting-divider"></div>')})),a.length>0&&0===n.length&&(i+=`
          <div class="state-screen">
            <div class="state-icon">✅</div>
            <p class="state-title">All done for today!</p>
            <p class="state-desc">No more upcoming meetings.</p>
          </div>
        `),i}}}(e)}</div>
    <div class="footer">
      <span class="footer-version">v${t}</span>
      <button class="footer-refresh" id="footer-refresh">Last updated just now</button>
    </div>
  `,null==(n=document.getElementById("footer-refresh"))||n.addEventListener("click",()=>r()),null==(a=document.getElementById("btn-grant"))||a.addEventListener("click",()=>i()),null==(l=document.getElementById("btn-retry"))||l.addEventListener("click",()=>r()),document.querySelectorAll(".btn-join").forEach(e=>{e.addEventListener("click",()=>{let t=e.dataset.url;t&&window.api.app.openExternal(t)})}))}async function i(){e={type:"no-permission",retrying:!0},a(),"granted"===await window.api.calendar.requestPermission()?await r():(e={type:"no-permission",retrying:!1},a())}async function r(){e={type:"loading"},a();try{let t=await window.api.calendar.getPermissionStatus();if("denied"===t||"not-determined"===t){e={type:"no-permission",retrying:!1},a();return}let n=await window.api.calendar.getEvents();e=0===n.length?{type:"no-events"}:{type:"has-events",events:n}}catch(t){e={type:"error",message:t instanceof Error?t.message:"Unknown error"}}a()}async function l(){t=await window.api.app.getVersion(),await r(),n&&clearInterval(n),n=setInterval(()=>r(),3e5)}document.addEventListener("DOMContentLoaded",()=>l())})();
// ==UserScript==
// @name         Remove ScienceDirect spam links
// @description  Removes the annoying links in articles which point to AI-generated summaries.
// @version      1.0
// @namespace    http://vansinne.se
// @grant        none
// @match        https://www.sciencedirect.com/*
// ==/UserScript==

function replaceTag(that) {
    var p = document.createElement('span');
    p.innerHTML = that.innerHTML;
    that.parentNode.replaceChild(p,that);
}

(async function() {
    var x = document.getElementsByClassName("topic-link");
    while(x.length == 0) {
        x = document.getElementsByClassName("topic-link");
        await new Promise(r => setTimeout(r, 100));
    }
    while (x.length > 0) {
        replaceTag(x[0]);
    }
})();


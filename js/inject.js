// inject player html and css
var castVideoPlayerCss = document.createElement('link');
castVideoPlayerCss.href = chrome.extension.getURL('css/castVideos.css');
castVideoPlayerCss.type = "text/css";
castVideoPlayerCss.rel = "stylesheet";
(document.head||document.documentElement).appendChild(castVideoPlayerCss);


loadTextResource(chrome.extension.getURL('player.html'), onPlayerHtmlSuccuess);


// help function to load resources
function loadTextResource(url, onSucessFunction) {

   var xhr = new XMLHttpRequest();

   xhr.onreadystatechange = function (e) { 
    if (xhr.readyState == 4 && xhr.status == 200) {
     onSucessFunction(xhr.responseText);
    }
   }

 xhr.open("GET", url, true);
 xhr.setRequestHeader('Content-type', 'text/html');
 xhr.send();
}

function onPlayerHtmlSuccuess(responseText) {
	var castVideoPlayerContentHtml = document.createElement('div');
	castVideoPlayerContentHtml.innerHTML = responseText;

	(document.body||document.documentElement).appendChild(castVideoPlayerContentHtml);

	// now append the scripts
	appendPlayerScripts();
}


function appendPlayerScripts() {
	// inject scripts
	var castVideoPlayerScript = document.createElement('script');
	var castSenderScript = document.createElement('script');

	castVideoPlayerScript.src = chrome.extension.getURL('js/castVideoPlayer.js');
	castSenderScript.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js";

	(document.head||document.documentElement).appendChild(castVideoPlayerScript);
	(document.head||document.documentElement).appendChild(castSenderScript);
}
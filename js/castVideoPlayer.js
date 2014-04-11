// Copyright 2014 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.


(function() {
  'use strict';


/**
 * Width of progress bar in pixel
 **/
var PROGRESS_BAR_WIDTH = 600;


/**
 * The max attempts count for timers
 **/
 var MAX_ATTEMPT_COUNT = 5;

/**
 * Constants of states for Chromecast device 
 **/
var DEVICE_STATE = {
  'IDLE' : 0, 
  'ACTIVE' : 1, 
  'WARNING' : 2, 
  'ERROR' : 3
};

/**
 * Constants of states for CastPlayer 
 **/
var PLAYER_STATE = {
  'IDLE' : 'IDLE', 
  'LOADING' : 'LOADING', 
  'LOADED' : 'LOADED', 
  'PLAYING' : 'PLAYING',
  'PAUSED' : 'PAUSED',
  'STOPPED' : 'STOPPED',
  'SEEKING' : 'SEEKING',
  'ERROR' : 'ERROR'
};

/**
 * Cast player object
 * main variables:
 *  - deviceState for Cast mode: 
 *    IDLE: Default state indicating that Cast extension is installed, but showing no current activity
 *    ACTIVE: Shown when Chrome has one or more local activities running on a receiver
 *    WARNING: Shown when the device is actively being used, but when one or more issues have occurred
 *    ERROR: Should not normally occur, but shown when there is a failure 
 *  - Cast player variables for controlling Cast mode media playback 
 *  - Local player variables for controlling local mode media playbacks
 *  - Current media variables for transition between Cast and local modes
 */
var CastPlayer = function() {
  /* device variables */
  // @type {DEVICE_STATE} A state for device
  this.deviceState = DEVICE_STATE.IDLE;

  /* Cast player variables */
  // @type {Object} a chrome.cast.media.Media object
  this.currentMediaSession = null;

  // @type {Number} volume
  this.currentVolume = 0.5;

  // @type {Boolean} A flag for autoplay after load
  this.autoplay = true;

  // @type {string} a chrome.cast.Session object
  this.session = null;

  // @type {PLAYER_STATE} A state for Cast media player
  this.castPlayerState = PLAYER_STATE.IDLE;


  /* Current media variables */
  // @type {Boolean} Audio on and off
  this.audio = true;

  this.mediaContent = null;

  // @type {Number} A number for current media time
  this.currentMediaTime = 0;

  // @type {Number} A number for current media duration
  this.currentMediaDuration = -1;

  // @type {Timer} A timer for tracking progress of media
  this.timer = null;

  // @type {Boolean} A boolean to stop timer update of progress when triggered by media status event 
  this.progressFlag = true;

  // @type {Number} A number in milliseconds for minimal progress update
  this.timerStep = 1000;

  this.initializeCastPlayer();
};


/**
 * Initialize Cast media player 
 * Initializes the API. Note that either successCallback and errorCallback will be
 * invoked once the API has finished initialization. The sessionListener and 
 * receiverListener may be invoked at any time afterwards, and possibly more than once. 
 */
CastPlayer.prototype.initializeCastPlayer = function() {

  if (!chrome.cast || !chrome.cast.isAvailable) {
    setTimeout(this.initializeCastPlayer.bind(this), 1000);
    return;
  }

  // default set to the default media receiver app ID
  // optional: you may change it to point to your own
  var applicationID = chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID;

  // request session
  var sessionRequest = new chrome.cast.SessionRequest(applicationID);
  var apiConfig = new chrome.cast.ApiConfig(sessionRequest,
    this.sessionListener.bind(this),
    this.receiverListener.bind(this));

  chrome.cast.initialize(apiConfig, this.onInitSuccess.bind(this), this.onError.bind(this));

  this.initializeUI();
  this.searchVideoSource();
};

/**
 * Callback function for init success 
 */
CastPlayer.prototype.onInitSuccess = function() {
  console.log("init success");
  this.updateMediaControlUI();
};

/**
 * Generic error callback function 
 */
CastPlayer.prototype.onError = function() {
  console.log("error");
};

/**
 * @param {!Object} e A new session
 * This handles auto-join when a page is reloaded
 * When active session is detected, playback will automatically
 * join existing session and occur in Cast mode and media
 * status gets synced up with current media of the session 
 */
CastPlayer.prototype.sessionListener = function(e) {
  this.session = e;
  if( this.session ) {
    this.deviceState = DEVICE_STATE.ACTIVE;
    if( this.session.media[0] ) {
      this.onMediaDiscovered('activeSession', this.session.media[0]);
    }
    else {
      // this.loadMedia(this.currentMediaIndex);
      // TODO: Check if we have to handle this case
    }
  }
}

/**
 * @param {string} e Receiver availability
 * This indicates availability of receivers but
 * does not provide a list of device IDs
 */
CastPlayer.prototype.receiverListener = function(e) {
  if( e === 'available' ) {
    console.log("receiver found");
  }
  else {
    console.log("receiver list empty");
  }
};


/**
 * Requests that a receiver application session be created or joined. By default, the SessionRequest
 * passed to the API at initialization time is used; this may be overridden by passing a different
 * session request in opt_sessionRequest. 
 */
CastPlayer.prototype.launchApp = function() {
  console.log("launching app...");
  chrome.cast.requestSession(this.onRequestSessionSuccess.bind(this), this.onLaunchError.bind(this));
  if( this.timer ) {
    clearInterval(this.timer);
  }
};

/**
 * Callback function for request session success 
 * @param {Object} e A chrome.cast.Session object
 */
CastPlayer.prototype.onRequestSessionSuccess = function(e) {
  console.log("session success: " + e.sessionId);
  this.session = e;
  this.deviceState = DEVICE_STATE.ACTIVE;
  this.updateMediaControlUI();
  this.loadMedia();
};

/**
 * Callback function for launch error
 */
CastPlayer.prototype.onLaunchError = function(error){
  console.log("launch error");
  this.deviceState = DEVICE_STATE.ERROR;
};

/**
 * Stops the running receiver application associated with the session.
 */
CastPlayer.prototype.stopApp = function() {
  this.session.stop(this.onStopAppSuccess.bind(this, 'Session stopped'),
      this.onError.bind(this));    

};

/**
 * Callback function for stop app success 
 */
CastPlayer.prototype.onStopAppSuccess = function(message) {
  console.log(message);
  this.deviceState = DEVICE_STATE.IDLE;
  this.castPlayerState = PLAYER_STATE.IDLE;
  this.currentMediaSession = null;
  clearInterval(this.timer);
  this.resetProgressAndDuration();
  this.updateMediaControlUI();
};

/**
 * Loads media into a running receiver application
 * @param {Number} mediaIndex An index number to indicate current media content
 */
CastPlayer.prototype.loadMedia = function(mediaIndex) {
  if (!this.session) {
    console.log("no session");
    return;
  }
  console.log("loading..." + this.mediaContent['title']);
  var mediaInfo = new chrome.cast.media.MediaInfo(this.mediaContent['source']);
  mediaInfo.contentType = 'video/mp4';
  
  var request = new chrome.cast.media.LoadRequest(mediaInfo);
  request.autoplay = this.autoplay;
  request.currentTime = 0;
   
  var payload = {
    "title:" : this.mediaContent['title'],
    "thumb" : this.mediaContent['thumb']
  };

  var json = {
    "payload" : payload
  };

  request.customData = json;

  this.castPlayerState = PLAYER_STATE.LOADING;
  this.session.loadMedia(request,
    this.onMediaDiscovered.bind(this, 'loadMedia'),
    this.onLoadMediaError.bind(this));

};

/**
 * Callback function for loadMedia success
 * @param {Object} mediaSession A new media object.
 */
CastPlayer.prototype.onMediaDiscovered = function(how, mediaSession) {
  console.log("new media session ID:" + mediaSession.mediaSessionId + ' (' + how + ')');
  this.currentMediaSession = mediaSession;
  if( how == 'loadMedia' ) {
    if( this.autoplay ) {
      this.castPlayerState = PLAYER_STATE.PLAYING;
    }
    else {
      this.castPlayerState = PLAYER_STATE.LOADED;
    }
  }

  if( how == 'activeSession' ) {
    this.castPlayerState = this.session.media[0].playerState; 
    this.currentMediaTime = this.session.media[0].currentTime; 
  }

  if( this.castPlayerState == PLAYER_STATE.PLAYING ) {
    // start progress timer
    this.startProgressTimer(this.incrementMediaTime);
  }

  this.currentMediaSession.addUpdateListener(this.onMediaStatusUpdate.bind(this));

  this.currentMediaDuration = this.currentMediaSession.media.duration;
  var duration = this.currentMediaDuration;
  var hr = parseInt(duration/3600);
  duration -= hr * 3600;
  var min = parseInt(duration/60);
  var sec = parseInt(duration % 60);
  if ( hr > 0 ) {
    duration = hr + ":" + min + ":" + sec;
  }
  else {
    if( min > 0 ) {
      duration = min + ":" + sec;
    }
    else {
      duration = sec;
    }
  }
  document.getElementById("duration").innerHTML = duration;

  // update UIs
  this.updateMediaControlUI();
};

/**
 * Callback function when media load returns error 
 */
CastPlayer.prototype.onLoadMediaError = function(e) {
  console.log("media error");
  this.castPlayerState = PLAYER_STATE.IDLE;
  // update UIs
  this.updateMediaControlUI();
};

/**
 * Callback function for media status update from receiver
 * @param {!Boolean} e true/false
 */
CastPlayer.prototype.onMediaStatusUpdate = function(e) {
  if( e == false ) {
    this.currentMediaTime = 0;
    this.castPlayerState = PLAYER_STATE.IDLE;
  }
  console.log("updating media");
  this.updateProgressBar(e);
  this.updateMediaControlUI();
};

/**
 * Helper function
 * Increment media current position by 1 second 
 */
CastPlayer.prototype.incrementMediaTime = function() {
  if( this.castPlayerState == PLAYER_STATE.PLAYING || this.localPlayerState == PLAYER_STATE.PLAYING ) {
    if( this.currentMediaTime < this.currentMediaDuration ) {
      this.currentMediaTime += 1;
      this.updateProgressBarByTimer();
    }
    else {
      this.currentMediaTime = 0;
      clearInterval(this.timer);
    }
  }
};

/**
 * Retry resoure search
 */ 
 CastPlayer.prototype.retrySourceSearch = function() {
   this.searchVideoSource();
 }


/**
 * Play media in Cast mode 
 */
CastPlayer.prototype.playMedia = function() {
  
  if(this.castPlayerState == PLAYER_STATE.IDLE)
    return;

  switch( this.castPlayerState) 
  {
    case PLAYER_STATE.LOADED:
    case PLAYER_STATE.PAUSED:
      this.currentMediaSession.play(null, 
        this.mediaCommandSuccessCallback.bind(this,"playing started for " + this.currentMediaSession.sessionId),
        this.onError.bind(this));
      this.currentMediaSession.addUpdateListener(this.onMediaStatusUpdate.bind(this));
      this.castPlayerState = PLAYER_STATE.PLAYING;
      // start progress timer
      this.startProgressTimer(this.incrementMediaTime);
      break;
    case PLAYER_STATE.LOADING:
    case PLAYER_STATE.STOPPED:
      this.loadMedia();
      this.currentMediaSession.addUpdateListener(this.onMediaStatusUpdate.bind(this));
      this.castPlayerState = PLAYER_STATE.PLAYING;
      break;
    default:
      break;
  }
  this.updateMediaControlUI();
};

/**
 * Pause media playback in Cast mode  
 */
CastPlayer.prototype.pauseMedia = function() {
  if( this.castPlayerState == PLAYER_STATE.PLAYING ) {
    this.castPlayerState = PLAYER_STATE.PAUSED;
    this.currentMediaSession.pause(null,
      this.mediaCommandSuccessCallback.bind(this,"paused " + this.currentMediaSession.sessionId),
      this.onError.bind(this));
    this.updateMediaControlUI();
    clearInterval(this.timer);
  }
};


/**
 * Stop meia playback in either Cast or local mode  
 */
CastPlayer.prototype.stopMedia = function() {
  this.currentMediaSession.stop(null,
    this.mediaCommandSuccessCallback.bind(this,"stopped " + this.currentMediaSession.sessionId),
    this.onError.bind(this));
  this.castPlayerState = PLAYER_STATE.STOPPED;
  clearInterval(this.timer);

  this.updateMediaControlUI();
};

/**
 * Set media volume in Cast mode
 * @param {Boolean} mute A boolean  
 */
CastPlayer.prototype.setReceiverVolume = function(mute) {
  var p = document.getElementById("audio_bg_level"); 
  var pos = parseInt(event.offsetY);

  
  if( event.currentTarget.id == 'audio_bg_track' || event.currentTarget.id == 'audio_bg_level' ) {
    // add a drag to avoid loud volume
    if( pos < 100 ) {
      var vScale = this.currentVolume * 100;
      p.style.height = pos + 'px';
      this.currentVolume = pos/100;
    }
    else {
      this.currentVolume = 1;
    }
  }

  if( !mute ) {
    this.session.setReceiverVolumeLevel(this.currentVolume,
      this.mediaCommandSuccessCallback.bind(this),
      this.onError.bind(this));
  }
  else {
    this.session.setReceiverMuted(true,
      this.mediaCommandSuccessCallback.bind(this),
      this.onError.bind(this));
  }
  this.updateMediaControlUI();
};

/**
 * Mute media function in either Cast or local mode 
 */
CastPlayer.prototype.muteMedia = function() {
  if( this.audio == true ) {
    this.audio = false;
    document.getElementById('audio_on').style.display = 'none';
    document.getElementById('audio_off').style.display = 'block';
    if( this.currentMediaSession ) {
      this.setReceiverVolume(true);
    }
  }
  else {
    this.audio = true;
    document.getElementById('audio_on').style.display = 'block';
    document.getElementById('audio_off').style.display = 'none';
    if( this.currentMediaSession ) {
      this.setReceiverVolume(false);
    }
  } 
  this.updateMediaControlUI();
};


/**
 * media seek function in either Cast or local mode
 * @param {Event} e An event object from seek 
 */
CastPlayer.prototype.seekMedia = function(event) {
  var pos = parseInt(event.offsetX);
  var pi = document.getElementById("progress_indicator"); 
  var p = document.getElementById("progress"); 
  if( event.currentTarget.id == 'progress_indicator' ) {
    var curr = parseInt(this.currentMediaTime + this.currentMediaDuration * pos / PROGRESS_BAR_WIDTH);
    var pp = parseInt(pi.style.marginLeft) + pos;
    var pw = parseInt(p.style.width) + pos;
  }
  else {
    var curr = parseInt(pos * this.currentMediaDuration / PROGRESS_BAR_WIDTH);
    var pp = pos -21 - PROGRESS_BAR_WIDTH;
    var pw = pos;
  }


  if(this.castPlayerState == PLAYER_STATE.PLAYING || this.castPlayerState == PLAYER_STATE.PAUSED ) {
    p.style.width = pw + 'px';
    pi.style.marginLeft = pp + 'px';
  }

  if( this.castPlayerState != PLAYER_STATE.PLAYING && this.castPlayerState != PLAYER_STATE.PAUSED ) {
    return;
  }

  this.currentMediaTime = curr;
  console.log('Seeking ' + this.currentMediaSession.sessionId + ':' +
    this.currentMediaSession.mediaSessionId + ' to ' + pos + "%");
  var request = new chrome.cast.media.SeekRequest();
  request.currentTime = this.currentMediaTime;
  this.currentMediaSession.seek(request,
    this.onSeekSuccess.bind(this, 'media seek done'),
    this.onError.bind(this));
  this.castPlayerState = PLAYER_STATE.SEEKING;

  this.updateMediaControlUI();
};

/**
 * Callback function for seek success
 * @param {String} info A string that describe seek event
 */
CastPlayer.prototype.onSeekSuccess = function(info) {
  console.log(info);
  this.castPlayerState = PLAYER_STATE.PLAYING;
  this.updateMediaControlUI();
};

/**
 * Callback function for media command success 
 */
CastPlayer.prototype.mediaCommandSuccessCallback = function(info, e) {
  console.log(info);
};

/**
 * Update progress bar when there is a media status update
 * @param {Object} e An media status update object 
 */
CastPlayer.prototype.updateProgressBar = function(e) {
  var p = document.getElementById("progress"); 
  var pi = document.getElementById("progress_indicator"); 
  if( e.idleReason == 'FINISHED' && e.playerState == 'IDLE' ) {
    p.style.width = '0px';
    pi.style.marginLeft = -21 - PROGRESS_BAR_WIDTH + 'px';
    clearInterval(this.timer);
    this.castPlayerState = PLAYER_STATE.STOPPED;
  }
  else {
    p.style.width = Math.ceil(PROGRESS_BAR_WIDTH * e.currentTime / this.currentMediaSession.media.duration + 1) + 'px';
    this.progressFlag = false; 
    setTimeout(this.setProgressFlag.bind(this),1000); // don't update progress in 1 second
    var pp = Math.ceil(PROGRESS_BAR_WIDTH * e.currentTime / this.currentMediaSession.media.duration);
    pi.style.marginLeft = -21 - PROGRESS_BAR_WIDTH + pp + 'px';
  }
};

/**
 * Set progressFlag with a timeout of 1 second to avoid UI update
 * until a media status update from receiver 
 */
CastPlayer.prototype.setProgressFlag = function() {
  this.progressFlag = true;
};

/**
 * Update progress bar based on timer  
 */
CastPlayer.prototype.updateProgressBarByTimer = function() {
  var p = document.getElementById("progress"); 
  if( isNaN(parseInt(p.style.width)) ) {
    p.style.width = 0;
  } 
  if( this.currentMediaDuration > 0 ) {
    var pp = Math.floor(PROGRESS_BAR_WIDTH * this.currentMediaTime/this.currentMediaDuration);
  }
    
  if( this.progressFlag ) { 
    // don't update progress if it's been updated on media status update event
    p.style.width = pp + 'px'; 
    var pi = document.getElementById("progress_indicator"); 
    pi.style.marginLeft = -21 - PROGRESS_BAR_WIDTH + pp + 'px';
  }

  if( pp > PROGRESS_BAR_WIDTH ) {
    clearInterval(this.timer);
    this.deviceState = DEVICE_STATE.IDLE;
    this.castPlayerState = PLAYER_STATE.IDLE;
    this.updateMediaControlUI();
  }
};

/**
 * Resets tne media time, duration and clears the update timer.   
 */
CastPlayer.prototype.resetProgressAndDuration = function() {
  this.currentMediaTime = 0;
  this.currentMediaDuration = 0;

  var p = document.getElementById("progress");
  var pi = document.getElementById("progress_indicator");

  p.style.width = '0';
  pi.style.marginLeft = -21 - PROGRESS_BAR_WIDTH + 'px';
}


/**
 * Update media control UI components based on localPlayerState or castPlayerState
 */
CastPlayer.prototype.updateMediaControlUI = function() {

  var playerState = this.castPlayerState;

  if( this.deviceState == DEVICE_STATE.ACTIVE ) {
    document.getElementById("casticonactive").style.display = 'block';
    document.getElementById("casticonidle").style.display = 'none';
  }
  else {
    document.getElementById("casticonidle").style.display = 'block';
    document.getElementById("casticonactive").style.display = 'none';
  }

  switch( playerState ) 
  {
    case PLAYER_STATE.LOADED:
    case PLAYER_STATE.PLAYING:
      document.getElementById("play").style.display = 'none';
      document.getElementById("pause").style.display = 'block';
      this.enableElement(document.getElementById("play"));
      this.enableElement(document.getElementById("duration"));
      this.enableElement(document.getElementById("audio_on"));
      this.enableElement(document.getElementById("audio_off"));
      break;
    case PLAYER_STATE.IDLE:
      this.disableElement(document.getElementById("play"));
      this.disableElement(document.getElementById("duration"));
      this.disableElement(document.getElementById("audio_on"));
      this.disableElement(document.getElementById("audio_off"));
      break;  
    case PLAYER_STATE.PAUSED:
    case PLAYER_STATE.LOADING:
    case PLAYER_STATE.STOPPED:
      document.getElementById("play").style.display = 'block';
      document.getElementById("pause").style.display = 'none';
      this.enableElement(document.getElementById("play"));
      this.enableElement(document.getElementById("duration"));
      this.enableElement(document.getElementById("audio_on"));
      this.enableElement(document.getElementById("audio_off"));
      break;
    default:
      break;
  }
}


/**
 * Helper class to disable player elements 
 */ 
 CastPlayer.prototype.disableElement = function(e) {
  e.style.opacity = 0.2;
  e.style.cursor = 'default';
 }


 /**
 * Helper class to disable player elements 
 */ 
 CastPlayer.prototype.enableElement = function(e) {
  e.style.opacity = 1.0;
  e.style.cursor = 'pointer';
 }




/**
 * Initialize UI components and add event listeners 
 */
CastPlayer.prototype.initializeUI = function() {

  // add event handlers to UI components
  document.getElementById("casticonidle").addEventListener('click', this.launchApp.bind(this));
  document.getElementById("casticonactive").addEventListener('click', this.stopApp.bind(this));
  document.getElementById("progress_bg").addEventListener('click', this.seekMedia.bind(this));
  document.getElementById("progress").addEventListener('click', this.seekMedia.bind(this));
  document.getElementById("progress_indicator").addEventListener('dragend', this.seekMedia.bind(this));
  document.getElementById("audio_on").addEventListener('click', this.muteMedia.bind(this));
  document.getElementById("audio_off").addEventListener('click', this.muteMedia.bind(this));
  document.getElementById("audio_bg").addEventListener('mouseover', this.showVolumeSlider.bind(this));
  document.getElementById("audio_on").addEventListener('mouseover', this.showVolumeSlider.bind(this));
  document.getElementById("audio_bg_level").addEventListener('mouseover', this.showVolumeSlider.bind(this));
  document.getElementById("audio_bg_track").addEventListener('mouseover', this.showVolumeSlider.bind(this));
  document.getElementById("audio_bg_level").addEventListener('click', this.setReceiverVolume.bind(this, false));
  document.getElementById("audio_bg_track").addEventListener('click', this.setReceiverVolume.bind(this, false));
  document.getElementById("audio_bg").addEventListener('mouseout', this.hideVolumeSlider.bind(this));
  document.getElementById("audio_on").addEventListener('mouseout', this.hideVolumeSlider.bind(this));
  document.getElementById("media_control").addEventListener('mouseover', this.showMediaControl.bind(this));
  document.getElementById("media_control").addEventListener('mouseout', this.hideMediaControl.bind(this));

  // enable play/pause buttons
  document.getElementById("play").addEventListener('click', this.playMedia.bind(this));
  document.getElementById("pause").addEventListener('click', this.pauseMedia.bind(this));
  document.getElementById("progress_indicator").draggable = true;


  // assume resource has not been found until search functions have been executed
  document.getElementById("media_title").innerHTML = "No resource found";
  document.getElementById("media_subtitle").innerHTML = "No subtitle";
  document.getElementById("media_info").style.display = 'inline-block';

  document.getElementById("retry").innerHTML = "(Retry)";
  document.getElementById("retry").addEventListener('click', this.retrySourceSearch.bind(this));

};



/**
 * Show the media control 
 */
CastPlayer.prototype.showMediaControl = function() {
  document.getElementById('media_control').style.opacity = 0.7;
};    

/**
 * Hide the media control  
 */
CastPlayer.prototype.hideMediaControl = function() {
  document.getElementById('media_control').style.opacity = 0;
};    

/**
 * Show the volume slider
 */
CastPlayer.prototype.showVolumeSlider = function() {
  if(this.audio && this.castPlayerState != PLAYER_STATE.IDLE) {
      document.getElementById('audio_bg').style.opacity = 1;
      document.getElementById('audio_bg_track').style.opacity = 1;
      document.getElementById('audio_bg_level').style.opacity = 1;
      document.getElementById('audio_indicator').style.opacity = 1;

      document.getElementById('audio_bg').style.display = 'block';
      document.getElementById('audio_bg_track').style.display = 'block';
      document.getElementById('audio_bg_level').style.display = 'block';
      document.getElementById('audio_indicator').style.display = 'block';
  }
};    

/**
 * Hide the volume stlider 
 */
CastPlayer.prototype.hideVolumeSlider = function() {
  document.getElementById('audio_bg').style.opacity = 0;
  document.getElementById('audio_bg_track').style.opacity = 0;
  document.getElementById('audio_bg_level').style.opacity = 0;
  document.getElementById('audio_indicator').style.opacity = 0;
};    
   

/**
 * @param {function} A callback function for the fucntion to start timer 
 */
CastPlayer.prototype.startProgressTimer = function(callback) {
  if( this.timer ) {
    clearInterval(this.timer);
    this.timer = null;
  }

  // start progress timer
  this.timer = setInterval(callback.bind(this), this.timerStep);
};



/**
 * The video source search function tries to find a video source using all of the defined video source seekers
 */
CastPlayer.prototype.searchVideoSource = function() {
  for (var i = 0; i < this.resourceSearchFunctions.length; i++) {
    
    if(this.mediaContent != null)
      break;

    var searchFuntion = this.resourceSearchFunctions[i].bind(this);
    searchFuntion();
  }

};



CastPlayer.prototype.onMediaSourceSearchSuccess = function() {

  if(this.mediaContent != null) {
    document.getElementById("media_title").innerHTML = this.mediaContent['title'];
    document.getElementById("media_subtitle").innerHTML = this.mediaContent['subtitle'];
    document.getElementById("media_info").style.display = 'inline-block';

    if(this.mediaContent['subtitle'] == "") {
       document.getElementById("media_subtitle").style.display = "none";  
    }

    document.getElementById("retry").style.display = "none";
  }

};


/**
 * Add all resource search function to this array.
 */
CastPlayer.prototype.resourceSearchFunctions =  [
    findCloudPlayerSource,
    findbitShareSource
];


/**
 * The resource search functions 
 */


//http://streamcloud.eu/ resources
 function findCloudPlayerSource(attemptCount) {

  // in case the media content has been detected meanwhiel by another function
  // cancel the search function
  if(this.mediaContent != null)
    return;

  if(attemptCount == undefined || attemptCount == null)
    attemptCount = 0;

  var callbackFunction = findCloudPlayerSource.bind(this);

  if (typeof jwplayer === "undefined") {
      if(attemptCount <= MAX_ATTEMPT_COUNT)
          setTimeout(function() {callbackFunction(attemptCount++)}, 1000);
        return;

  } else {


    if (jwplayer().getPlaylist == undefined || jwplayer().getPlaylist() == undefined) {
      if(attemptCount <= MAX_ATTEMPT_COUNT)
        setTimeout(function() {callbackFunction(attemptCount++)}, 1000);
      return;
    }

    var media = jwplayer().getPlaylist()[0];

    if(media != null || media != undefined) {
      
      this.mediaContent = new Array();
        if (media.title != undefined) {
            this.mediaContent['title'] = media.title + "";
        } else {
            var grepTitleFromStreamCloudPage = function() {
                var page = document.getElementById("page");
                if (page == undefined) {
                    return undefined;
                }
                var pageHeader = page.getElementsByClassName("header page");
                if (!pageHeader.length) {
                    return undefined;
                }
                return pageHeader[0].firstElementChild.innerHTML;
            };
            this.mediaContent['title'] = grepTitleFromStreamCloudPage();
        }

      if(media.file.indexOf("http") != 0) {
          this.mediaContent['source'] = "http://" + window.location.host + media.file;
      } else {
          this.mediaContent['source'] = media.file;
      }

      this.mediaContent['thumb'] = media.image;
      this.mediaContent['subtitle'] = "";

      this.onMediaSourceSearchSuccess();
    }
  }
 }


 // http://bitshare.com/
 function findbitShareSource() {

  // in case the media content has been detected meanwhiel by another function 
  // cancel the search function 
  if(this.mediaContent != null)
    return;


  var streamFlashElement = document.getElementById("stream_flash");
  if(streamFlashElement == null)
    return;

  var scriptElements = streamFlashElement.getElementsByTagName("script");
  if(scriptElements.length < 2)
    return;

  var playerScript = document.getElementById("stream_flash").getElementsByTagName("script")[1].innerHTML;
  if(playerScript.length < 1)
    return;

  var regexp = /url: '(.*)(.avi)'/m;
  var match = regexp.exec(playerScript);
  if(match == null || match.length < 3)
    return;

  var mediaUrl = match[1] + match[2];

      
    this.mediaContent = new Array();
    this.mediaContent['title'] = "Unknown";
    this.mediaContent['source'] = mediaUrl;
    this.mediaContent['thumb'] = "";
    this.mediaContent['subtitle'] = "";

    this.onMediaSourceSearchSuccess();

  }

 /**
 * End definition of resource search functions
 */

  window.CastPlayer = CastPlayer;
})();

var CastPlayer = new CastPlayer();
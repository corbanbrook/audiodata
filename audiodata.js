/*
 * Audio Data API Objects
 * Copyright (c) 2010 notmasteryet
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/*jslint indent:2, nomen: false, plusplus: false, onevar: false */
/*global Float32Array: true, Audio: true, clearInterval: true, 
  setInterval: true */

/**
 * This is a audio parameters structure. The structure contains channels and 
 * sampleRate parameters of the sound.
 * @param {int} channels The amount of the channels.
 * @param {int} sampleRate The sampling rate of the sound.
 * @constructor
 */
function AudioParameters(channels, sampleRate) {
  /**
   * Gets the amount of channels of the sound.
   * @type int
   */
  this.channels = channels;

  /**
   * Gets the sampling rate of the sound.
   * @type int
   */
  this.sampleRate = sampleRate;
}

/**
 * Maker of the end of the sound stream.
 * @final
 */
var EndOfAudioStream; // implicit = undefined;

/**
 * Compares two instances of the audio parameters structure.
 * @param {AudioParameters} other The other audio parameters structure.
 * @returns {boolean} true is the structures have same channels amount and sample rate.
 */
AudioParameters.prototype.match = function (other) {
  return this.channels === other.channels && this.sampleRate === other.sampleRate;
};

/**
 * The audio data source for the HTMLMediaElement (&lt;video&gt; or 
 * &lt;audio&gt;).
 * @param {HTMLMediaElement} mediaElement The HTML media element.
 * @constructor
 * @implements IAudioDataSourceMaster
 */
function AudioDataSource(mediaElement) {
  if (!("mozChannels" in mediaElement)) {
    throw "Audio Data API read is not supported";
  }

  /**
   * Gets HTML media element that is a source of a sound.
   * @type HTMLMediaElement
   */
  this.mediaElement = mediaElement;
}
/**
 * Begins to read of the sound data and sending it to the destination.
 * @param {IAudioDataDestination} destination The destination where data will be sent.
 */
AudioDataSource.prototype.readAsync = function (destination) {
  this.__destination = destination;
  var source = this;

  function onAudioAvailable(event) {
    var soundData = event.frameBuffer,
        written = destination.write(soundData);
    /* ignoring if whole data was not written */
  }

  function onLoadedMetadata(event) {
    if (source.__destinationInitialized) {
      return;
    }

    source.onload();
  }

  var media = this.mediaElement;
  media.addEventListener("MozAudioAvailable", onAudioAvailable, false);
  media.addEventListener("loadedmetadata", onLoadedMetadata, false);
  this.__removeListeners = function () {
    media.removeEventListener("MozAudioAvailable", onAudioAvailable, false);
    media.removeEventListener("loadedmetadata", onLoadedMetadata, false);    
  };

  // Time to initialize?
  if (media.readState !== 0) {
    // all except HAVE_NOTHING
    this.onload();
  }
};

/**
 * Ends to read the sound data. 
 * @see #readAsync
 */
AudioDataSource.prototype.shutdown = function () {
  if (this.__removeListeners) {
    this.__removeListeners();
    delete this.__removeListeners;
  }
  if (this.__destinationInitialized) {
    this.__destination.shutdown();
    delete this.__destinationInitialized;
  }
  delete this.__destination;
};

/**
 * Initializes the audio parameters.
 * @private
 */
AudioDataSource.prototype.onload = function () {
  var media = this.mediaElement;
  var audioParameters = new AudioParameters(media.mozChannels, media.mozSampleRate);
  this.audioParamaters = audioParameters;

  this.__destination.init(audioParameters);
  this.__destinationInitialized = true;
};

/**
 * Basic audio destination object.
 * @constructor
 * @implements IAudioDataDestinationMaster
 * @implements IAudioDataDestination
 */
function AudioDataDestination() {
}

/**
 * Gets the parameters of the sound.
 * @type AudioParameters
 */
AudioDataDestination.prototype.audioParameters = null;
/**
 * Gets or sets if auto latency mode for {@link #writeAsync} is enabled.
 * Disabled by default.
 * @type boolean
 */
AudioDataDestination.prototype.autoLatency = false;
/**
 * Gets or sets latency mode for {@link #writeAsync}. The latency is set
 * in seconds. By defualt, it's set to 0.5 (500ms).
 * @type float
 */
AudioDataDestination.prototype.latency = 0.5;
/**
 * Gets the playback position.
 * @type int
 */
AudioDataDestination.prototype.currentPlayPosition = 0;
/**
 * Gets the amount of data written so far.
 * @type int
 */
AudioDataDestination.prototype.currentWritePosition = 0;
/**
 * Initializes the output with the {@link AudioParameters}.
 * @param {AudioParameters} audioParameters The parameters of the sound.
 */
AudioDataDestination.prototype.init = function (audioParameters) {
  if (!(audioParameters instanceof AudioParameters)) {
    throw "Invalid audioParameters type";
  }

  this.audioParameters = audioParameters;
  var audio = new Audio();
  if (!("mozSetup" in audio)) {
    throw "Audio Data API write is not supported";
  }
  audio.mozSetup(audioParameters.channels, audioParameters.sampleRate);
  this.__audio = audio;
  this.currentPlayPosition = 0;
  this.currentWritePosition = 0;
};

/**
 * Destroys the output. 
 * @see #write
 */
AudioDataDestination.prototype.shutdown = function () {
  if (this.__asyncInterval) {
    clearInterval(this.__asyncInterval);
    delete this.__asyncInterval;
  }
  delete this.__audio;
};

/**
 * Writes the data to the output. No all the data can be written.
 * @param {Array} data The array of the samples. 
 * @returns {int} The amount of the written samples.
 */
AudioDataDestination.prototype.write = function (data) {
  return this.__audio.mozWriteAudio(data);
};

/**
 * Begins the write the data from the source. The writting is perform with the
 * specified by {@link #latency} parameter.
 * @param {IAudioDataSource} source The source of the data.
 * @see #latency
 * @see #autoLatency
 */
AudioDataDestination.prototype.writeAsync = function (source) {
  var audioParameters = source.audioParameters;
  var channels = audioParameters.channels;
  var samplesPerSecond = channels * audioParameters.sampleRate;
  this.init(audioParameters);
  
  var tail = null;
  var autoLatency = this.autoLatency;
  var prebufferSize, prebufferSizeDelta;

  if (autoLatency) {
    this.latency = 0;
    prebufferSize = samplesPerSecond * 0.020; // initial latency 20ms
    prebufferSizeDelta = samplesPerSecond * 0.010; // with 10ms step
  } else {
    prebufferSize = samplesPerSecond * this.latency;
  }

  var destination = this, audio = this.__audio;

  function shutdownWrite() {
    clearInterval(this.__asyncInterval);
    delete this.__asyncInterval;

    destination.shutdown();
  }

  // The function called with regular interval to populate 
  // the audio output buffer.
  this.__asyncInterval = setInterval(function () {
    // Updating the play position.
    destination.currentPlayPosition = audio.mozCurrentSampleOffset();

    var written;
    // Check if some data was not written in previous attempts.
    if (tail) {  
      written = audio.mozWriteAudio(tail);
      destination.currentWritePosition += written;
      if (written < tail.length) {
        // Not all the data was written, saving the tail...
        tail = tail.slice(written);
        return; // ... and exit the function.
      }
      tail = null;
    }

    // Check if we need add some data to the audio output.
    var available = destination.currentPlayPosition + 
                    prebufferSize - destination.currentWritePosition;

    // Auto latency detection
    if (autoLatency) {
      if (destination.currentPlayPosition) { // play position moved
        if (destination.currentPlayPosition === destination.currentWritePosition) {
          // bug 591719 workaround
          prebufferSize += prebufferSizeDelta;               
        } else {
          autoLatency = false;
          prebufferSize += 2 * prebufferSizeDelta; // add couple for missed timer events
          destination.latency = prebufferSize / samplesPerSecond;
        }
      } else {
        prebufferSize += prebufferSizeDelta;
      }
    }

    if (available >= channels) {
      // Request some sound data from the callback function, align to channels boundary.
      var soundData = new Float32Array(available - (available % channels));
      var read = source.read(soundData);
      if (read === null || read === EndOfAudioStream) {
        // End of stream
        shutdownWrite();
        return;
      }

      if (read === 0) {
        return; // no new data found
      }

      if (read < available) {
        soundData = soundData.slice(0, read);
      }

      // Writting the data.
      written = audio.mozWriteAudio(soundData);
      if (written < soundData.length) {
        // Not all the data was written, saving the tail.
        tail = soundData.slice(written);
      }
      destination.currentWritePosition += written;
    }
  }, 10);
};

/**
 * Simple array-based source.
 * @param {AudioParameters} audioParameters The parameters of the sound.
 * @param {Array} data The sample data.
 * @constructor
 * @implements IAudioDataSource
 */
function AudioDataMemorySource(audioParameters, data) {
  /**
   * Gets audio parametes.
   * @type AudioParameters
   */
  this.audioParameters = audioParameters;
  /**
   * Gets the sample data.
   * @type Array
   */
  this.data = data;
  /**
   * Gets or sets the read position.
   * @private
   */
  this.readPosition = 0;
}
/**
 * Reads portion of the data.
 * @param {Array} data The input data buffer.
 * @returns The amount of read data, or EndOfAudioStream if no data available.
 */
AudioDataMemorySource.prototype.read = function (buffer) {
  if (this.data.length <= this.readPosition) {
    return EndOfAudioStream;
  }

  var position = this.readPosition, data = this.data,
    read = Math.min(buffer.length, data.length - position);
  for (var i = 0; i < read; ++i) {
    buffer[i] = data[position++];
  }
  this.readPosition = position;
  return read;
};

/**
 * Stores all written data.
 * @constructor
 * @implements IAudioDataDestination
 */
function AudioDataMemoryDestination() {
  /**
   * Gets the write position.
   * @type int
   */
  this.currentWritePosition = 0;
  /**
   * Gets the buffered data store.
   * @private
   */
  this.__buffers = [];
}
/**
 * Gets the parameters of the sound.
 * @type AudioParameters
 */
AudioDataMemoryDestination.prototype.audioParameters = null;
/**
 * Initializes the memory buffer with the audio parameters.
 * @param {AudioParameters} audioParameters The parameters of the sound.
 */
AudioDataMemoryDestination.prototype.init = function (audioParameters) {
  this.audioParameters = audioParameters;
};
/**
 * Finalizes the memory buffer.
 */
AudioDataMemoryDestination.prototype.shutdown = function () {
};
/**
 * Writes the data to the memory buffer.
 * @param {Array} soundData The array of the samples. 
 * @returns {int} The amount of the written samples. That equals to 
 *   the soundData length.
 */
AudioDataMemoryDestination.prototype.write = function (soundData) {
  this.currentWritePosition += soundData.length;
  this.__buffers.push(soundData);
  return soundData.length;
};
/**
 * Exports the written data as an array.
 * @returns {Array} All written sound data.
 */
AudioDataMemoryDestination.prototype.toArray = function () {
  var data = new Float32Array(this.currentWritePosition), position = 0;
  var buffers = this.__buffers;
  for (var i = 0; i < buffers.length; ++i) {
    var buffer = buffers[i];
    for (var j = 0; j < buffer.length; ++j) {
      data[position++] = buffer[j];
    }
  }
  return data;
};

/**
 * Mixes signal from several sources.
 * @param {AudioParameters} audioParameters The parameters of the sound.
 * @constructor
 * @implements IAudioDataSource
 */
function AudioDataMixer(audioParameters) {
  /**
   * Gets audio parametes.
   * @type AudioParameters
   */  
  this.audioParameters = audioParameters;
  /**
   * Gets input sources.
   * @private
   */
  this.__sources = [];
}
/**
 * Adds new input source to the mixer. The source will be removed when the end of 
 * the stream will be found.
 * @param {IAudioDataSource} source The input source.
 */
AudioDataMixer.prototype.addInputSource = function (source) {
  if (!source.audioParameters.match(this.audioParameters)) {
    throw "Invalid input parameters";
  }
  this.__sources.push(source);
};
/**
 * Reads the data from the input source(s) and joins in one output array.
 * @param {Array} soundData The result output sound data.
 * @returns {int} Returns amount of data that was read -- equals to 
 *   the lengths of the soundData array.
 */
AudioDataMixer.prototype.read = function (soundData) {
  var sources = this.__sources, size = soundData.length;
  var toRemove = [];
  for (var i = 0; i < sources.length; ++i) {
    // Make new array before using it with the sources
    var data = new Float32Array(size);
    var read = sources[i].read(data);

    if (read === null || read === EndOfAudioStream) {
      toRemove.push(i);
      continue;
    }

    for (var j = 0; j < read; ++j) {
      soundData[j] += data[j];
    }
  }
  // Remove inputs that's ended
  while (toRemove.length > 0) {
    sources.splice(toRemove.pop(), 1);
  }
  return size;
};

/**
 * The splitter node that sends written data to the multiple destinations.
 * @contructor
 * @implements IAudioDataDestination
 */
function AudioDataSplitter() {
  /**
   * Gets destinations.
   * @private
   */
  this.__destinations = [];
}
/**
 * Gets the parameters of the sound.
 * @type AudioParameters
 */
AudioDataSplitter.prototype.audioParameters = null;
/**
 * Adds new output destination to the splitter.
 * @param {IAudioDataDestination} destination The output destination.
 */
AudioDataSplitter.prototype.addOutputDestination = function (destination) {
  this.__destinations.push(destination);
  if (this.audioParameters !== null) {
    destination.init(this.audioParameters);
  }
};
/**
 * Remove the output destination from the splitter.
 * @param {IAudioDataDestination} destination The output destination.
 */
AudioDataSplitter.prototype.removeOutputDestination = function (destination) {
  var index = 0, destinations = this.__destinations;
  while (index < destinations.length && destinations[index] !== destination) {
    ++index;
  }
  if (index < destinations.length) {
    this.destinations.splice(index, 1);
    if (this.audioParameters) {
      destination.shutdown();
    }
  }
};
/**
 * Initializes the splitter with the audio parameters.
 * @param {AudioParameters} audioParameters The parameters of the sound.
 */
AudioDataSplitter.prototype.init = function (audioParameters) {
  this.audioParameters = audioParameters;
  var destinations = this.__destinations;
  for (var i = 0; i < destinations.length; ++i) {
    destinations[i].init(audioParameters);
  }
};
/**
 * Destroys the splitter and all connected output destinations.
 */
AudioDataSplitter.prototype.shutdown = function () {
  var destinations = this.__destinations;
  for (var i = 0; i < destinations.length; ++i) {
    destinations[i].shutdown();
  }
  this.audioParameters = null;
};
/**
 * Writes the data to the all connection output destination(s).
 * @param {Array} soundData The array of the samples. 
 * @returns {int} The amount of the written samples. That equals to 
 *   the soundData length.
 */
AudioDataSplitter.prototype.write = function (soundData) {
  var destinations = this.__destinations, size = soundData.length;
  for (var i = 0; i < destinations.length - 1; ++i) {
    // Make copies for all outputs except last one
    var data = new Float32Array(size);
    for (var j = 0; j < size; ++j) {
      data[j] = soundData[j];
    }    
    destinations[i].write(data);
  }
  if (destinations.length > 0) {
    destinations[destinations.length - 1].write(soundData);
  }
  return size;
};



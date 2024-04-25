function containsTOS(text) {
  return (
    text.search("Terms of Use") != -1 ||
    text.search("Terms of Service") != -1 ||
    text.search("Privacy Policy") != -1
  );
}

function highlightText(wordQuery, category) {
  var instance = new Mark(document.querySelector("*"));
  var options = {
    separateWordSearch: false,
    className: category,
    noMatch: function (term) {
      var split = term.split(/<[^>]*>/);
      for (var j = 0; j < split.length; j++) {
        if (split[j].split(" ").length < 10) {
          continue;
        }
        instance.mark(split[j], {
          separateWordSearch: false,
          className: category,
        });
      }
    },
  };
  instance.mark(wordQuery, options);
}

var filterKeys = ["govt", "track", "share", "sell", "copyright", "court"];

var filterDict = [
  /government request|(disclose.*legal|legal.*disclose)|subpoena|lawful interception|release/gim,
  /DNT| track |(record.*plugin|plugin.*record)/gim,
  /(shar.*(part|aggregate|anonymize|other))|((part|aggregate|anonymize|other).*shar)/gim,
  /((info|data|affiliate).*(merge|sale|sell|acqui|bankrupt|insolven|transfer))|((merge|sale|sell|acqui|bankrupt|insolven|transfer).*(info|data|affiliate))/gim,
  /((stuff|content|submission|property).*(rights|license|property|copyright|reproduce|distribute|modify|owner))|((rights|license|property|copyright|reproduce|distribute|modify|owner).*(stuff|content|submission|property))/gim,
  /((waive|agree).*(court|arbitration|dispute|injuncti))|((court|arbitration|dispute|injuncti).*(waive|agree))/gim,
];

var filterLength = filterDict.length;

function filterSentence(sentence) {
  var toReturn = [];
  for (var i = 0; i < filterLength; i++) {
    if (filterDict[i].exec(sentence) !== null) {
      toReturn.push(i);
    }
  }
  return toReturn;
}

function cleanupSentence(sentence) {
  if (sentence.length > 1000) {
    return "";
  }

  var clean = sentence.replace(/<[^>]*>/gi, "");
  clean = clean.replace(/[^a-z .,?!-:;\"\']/gi, " ");
  clean = clean.replace(/&.t;/g, "");
  clean = clean.replace(/&nbsp;/g, "");
  clean = clean.replace(/a href/g, "");
  clean = clean.replace(/\/p /g, "");
  clean = clean.replace(/\/a /g, "");
  clean = clean.replace(/([a-zA-Z-]* "[a-zA-Z0-9- #:\/,']*".){2,}/gm, " ");
  clean = clean.replace(/ {2,}/g, " ");
  clean = clean.trim();

  if (clean.split(" ").length < 10) {
    return "";
  }

  return clean;
}

function breakIntoSentences(text) {
  var finalSentences = [];

  var firstIteration = text.split(/\.(\s|\"|\'|\|![A-Za-z0-9])/);

  for (var k = 0; k < firstIteration.length; k++) {
    var secondIteration = firstIteration[k].split(/(<b>|<br>|<div>|<li>|<ul>)/);
    for (var l = 0; l < secondIteration.length; l++) {
      finalSentences.push(secondIteration[l]);
    }
  }

  return finalSentences;
}

function hashCode(s) {
  for (var i = 0, h = 0; i < s.length; i++)
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function DOMtoString(document_root) {
  var acceptedTags = ["A", "UL", "LI", "BR", "B", "P"];
  var all = document.getElementsByTagName("*");
  var pageText = "";
  var numSentences = 0;

  var keptSentences = {}; // categories -> list of cleaned sentences (for display)
  var cleanToRaw = {}; // cleaned sentence -> raw sentence (for highlighting)
  var hashes = {}; // string hashes

  for (var i = 0; i < all.length; i++) {
    var curElem = all[i];
    pageText += curElem.tagName + "\n";

    // look only at valid tags
    if (acceptedTags.indexOf(curElem.tagName) > -1) {
      pageText += "\n" + curElem.innerHTML + "\n";
      var text = curElem.innerHTML;

      var curSentences = breakIntoSentences(text);

      for (var j = 0; j < curSentences.length; j++) {
        var cleanSentence = cleanupSentence(curSentences[j]);

        var filters = filterSentence(cleanSentence);
        if (filters.length > 0 && !(cleanSentence in cleanToRaw)) {
          cleanToRaw[cleanSentence] = curSentences[j];

          for (f = 0; f < filters.length; f++) {
            var filterFound = filterKeys[filters[f]];
            if (!(filterFound in keptSentences)) {
              keptSentences[filterFound] = [];
              hashes[filterFound] = [];
            }
            var thisHash = hashCode(cleanSentence.substr(0, 50));
            if (!hashes[filterFound].includes(thisHash)) {
              hashes[filterFound].push(thisHash);
              keptSentences[filterFound].push(cleanSentence);
              numSentences += 1;
            }
          }
        }
      }
    }
  }

  console.log(keptSentences);
  console.log(numSentences);
  if (numSentences < 4) {
    return null;
  }

  for (var category in keptSentences) {
    var categoryCleanSentences = keptSentences[category];
    for (var i = 0; i < categoryCleanSentences.length; i++) {
      var cleanSentence = categoryCleanSentences[i];
      highlightText(cleanToRaw[cleanSentence], category);
    }
  }
  return JSON.stringify({
    sentences: keptSentences,
    cleanToRaw: cleanToRaw,
  });
}

chrome.runtime.onMessage.addListener(function (request, sender) {
  if (request.action == "scroll") {
    var scrollParams = JSON.parse(request.source);
    var sentence = scrollParams["sentence"];
    var category = scrollParams["category"];

    var all = document.getElementsByClassName(category);

    var div = "NONE";
    for (var i = 0; i < all.length; i++) {
      if (all[i].innerHTML.includes(sentence)) {
        div = all[i];
        div.scrollIntoView({ block: "center" });
        break;
      }
    }
  }
});

chrome.runtime.sendMessage({
  action: "getSource",
  source: DOMtoString(document),
});

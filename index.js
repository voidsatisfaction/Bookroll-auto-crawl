var Nightmare = require('nightmare');		
var nightmare = Nightmare({ show: true });
var fs = require('fs');
var rp = require('request-promise');
var request = require('request');
var tough = require('tough-cookie');
var htmlParser = require('htmlparser2');
var { URL } = require('url');

var loginURL = 'https://bookroll.let.media.kyoto-u.ac.jp/bookroll/login';
var host = 'https://bookroll.let.media.kyoto-u.ac.jp';

var JSESSIONID = '';

var semester = 'https://bookroll.let.media.kyoto-u.ac.jp/bookroll/home/index?firstId=7&beforeId=';

/* Input your bookroll id and password */

var userId = '';
var userPassword = '';

var success = 0;
var fail = 0;

nightmare
  /* Login success */
  .goto(loginURL)
  .type('#userid', userId)
  .type('#password', userPassword)
  .click('#btn-login')
  .wait('#bookroll-dashboard')
  /* Get all Lectures */
  .cookies.get('JSESSIONID')
  .then(function (result) {
    JSESSIONID = result.value;
    return;
  })
  .then(function () {
    /* Set session */
    var session = new tough.Cookie({
      key: 'JSESSIONID',
      value: JSESSIONID,
      domain: 'bookroll.let.media.kyoto-u.ac.jp',
      maxAge: 31536000
    });

    var cookiejar = rp.jar();
    cookiejar.setCookie(session, host);
    
    /* Intro */

    var intro = function(data) {
      console.log('On processing....');
      return data;
    }

    /* Requests */
    var injectURL = function(uri) {
      var sessionOption = {
        method: 'GET',
        uri: uri,
        jar: cookiejar
      };
      return sessionOption;
    };

    var injectImgURL = function(uri) {
      var sessionOption = {
        method: 'GET',
        uri: uri,
        jar: cookiejar,
        encoding: null,
        timeout: 30*1000,
      };
      return sessionOption;
    };    

    var parseLectures = function(html) {
      var myLectures = [];
      var parser = new htmlParser.Parser({
        onopentag: (name, attr) => {
          if(name == 'a' && attr.class == 'directory_close') {
            myLectures.push(host + attr.href);
          }
        },
        ontext: (text) => {
          if (text == 'テスト') {
            myLectures.pop();
          }
        },
      }, { decodeEntities: true });
      parser.write(html);
      parser.end();
      return myLectures;
    };

    var parseContents = function(myLectures) {
      var parseContent = function(lecture) {
        return rp(injectURL(lecture))
          .then(function (html) {
            var url = [];
            var parser = new htmlParser.Parser({
              onopentag: (name, attr) => {
                if(name == 'input' && attr.class == 'viewerUrl') {
                  url.push(attr.value);
                }
              },
            }, { decodeEntities: true });
            parser.write(html);
            parser.end();
            return url;
          });
      };
      return Promise.all(myLectures.map(function (lecture) {
          return parseContent(lecture);
        })).then(function(result) {
          return Array.prototype.concat.apply([], result);
        });
    };

    var parseContentsLists = function(myContents) {
      var parseLists = function(listURL) {
        return rp(injectURL(listURL))
          .then(function (html) {
            return html.split('\n').filter(function (element) {
              return element !== '';
            })
            .map(function (element) {
              return listURL + '/' + element;
            });
          });
      };

      myContents = myContents.map(function(contentURL) {
        var myURL = new URL(contentURL);
        var contentId = myURL.searchParams.get('contents');
        var contentListUrl = host + 
          '/bookroll/contents/unzipped/' +
          contentId +
          '/OPS/images';
        return contentListUrl;
      });
      
      return Promise.all(myContents.map(parseLists))
    };

    var makeFile = function(lists) {
      var download = function(uri, filename){
        return new Promise(function(resolve, reject) {
          setTimeout(function() {
            request(injectImgURL(uri), function(error, response, body) {
              if (error) {
                console.error(error);
                fail += 1;
                reject('not success');
              }
              fs.writeFile(filename, body, {
                  encoding : null
              }, function(err) {
                if (err) {
                  console.error('There was error on ' + filename);
                  console.error(err);
                  fail += 1;
                  reject('not success');
                }
                    
                console.log('It\'s saved!　' + filename);
                success += 1;
                resolve('success');
              });
            })
          }, Math.random() * 2 * 1000);
        }) 
      };

      return Promise.all(lists.map(function(list, i) {
        return Promise.all(list.map(function(imgURL, j) {
          var folder = './lecture' + i;
          if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder);
          }
          // change file name to jpg numer
          var url_devide = imgURL.split('/');
          var f = url_devide[url_devide.length-1];
          var fileName = folder + '/' + f;
          return download(imgURL, fileName); 
        }));
      }));
    };

    /* Main */
    rp(injectURL(semester))
      .then(intro)
      .then(parseLectures)
      .then(parseContents)
      .then(parseContentsLists)
      .then(makeFile)
      .catch(function (err) {
        console.log('error occured!');
        console.error(err);
      })
      .then(function() {
        console.log('******* Hack finished *******');
        console.log('All files : ' + (success + fail));
        console.log('Success files : ' + success);
        console.log('fail files : ' + fail);
        console.log('******* You can exit virtual browser *******');
        return;
      });
  })
  .catch(function (error) {
    console.error('Search failed:', error);
  });

/* How to configure all download complete? */
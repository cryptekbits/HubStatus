$.ajax('http://hdbits.tech/', {
    statusCode: {
        404: function() {
            var reachable=0;
        },
        200: function() {
            var reachable =1;
        }
    }
});
if (reachable==1){
    tweet='//hdbits.tech/CDN/Javascripts/widgets.js'
    };
if (reachable==0){
    tweet='//platform.twitter.com/widgets.js'
    };
var twitter= document.getElementsByClassName('twitter_innter_content')[0];
var script= document.createElement('script');
script.type= 'text/javascript';
script.src= tweet;
twitter.appendChild(script);
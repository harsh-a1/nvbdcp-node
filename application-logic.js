/**
 * Created by harsh on 16/7/16.
 */

function Engine(){

    var CONSTANTS = require("./CONSTANTS");
    var Q = require('q');
    var moment = require("moment");
    var ajax = require("./ajax");

    this.processData = function(logID,data){
        getOrgUnitByPhone(logID,data.sender).then(function(orgUnits){
            var message = messageParser(data.content);
            if (orgUnits.length>0){
              //  __logger.info(logID + "Org Unit Found");
                if (message == CONSTANTS.INVALID_FORMAT){
                    prepareEventAndPush(logID,data,orgUnits[0],false);
                }else{
                    prepareDVSAndPush(logID,message,orgUnits[0],data);
                }
            }else{// Phone not registered
            //    __logger.info(logID + "Org Unit Not Found");
                if (message == CONSTANTS.INVALID_FORMAT) {
                        prepareEventAndPush(logID,data,false,false);
                    }else{
                        prepareEventAndPush(logID,data,false,true);
                    }
                }
        })
    }

    function messageParser(message){

        message = JSON.parse(JSON.stringify(message));
        var result = {
            field1	:	undefined,
            field2	:	undefined,
            field3	:	undefined,
            field4	:	undefined,
            field5	:	undefined,
            field6	:	undefined,
            field7	:	undefined
        };

         message = message.replace(/[.]+/g,".");
         message = message.replace(/[.]\s+/g,".");

        var pattern = /^\s*\d+\s*[.]\s*\d+\s*[.]\s*\d+\s+\d+\s*[.]\s*\d+\s*[.]\s*\d+\s+\d+\s*$/;
        var index = 0;
        if (pattern.test(message)){

            index= message.indexOf(".");
            result.field1 = message.substring(0,index).trim();
            message = message.substring(index+1,message.length);

            index= message.indexOf(".");
            result.field2 = message.substring(0,index).trim();
            message = message.substring(index+1,message.length);

                    index= message.indexOf(" ");
                    result.field3 = message.substring(0,index).trim();
                    message = message.substring(index+1,message.length);

            index= message.indexOf(".");
            result.field4 = message.substring(0,index).trim();
            message = message.substring(index+1,message.length);

            index= message.indexOf(".");
            result.field5 = message.substring(0,index).trim();
            message = message.substring(index+1,message.length);

                    index= message.indexOf(" ");
                    result.field6 = message.substring(0,index).trim();
                    message = message.substring(index+1,message.length);

            result.field7 = message.trim();

            return result;
        }

        return CONSTANTS.INVALID_FORMAT;
    }

    function prepareDVSAndPush(logID,message,ou,data){

        var orgUnit = ou.id;
        var msgDate = moment(data.rcvd, "YYYY-MM-DD HH:mm:ss");
        var period = msgDate.format("YYYYMMDD");
        var storedBy = CONSTANTS.username;

        var dv = {"dataValues":[]};

        dv.dataValues.push(makeDVJson(CONSTANTS.field1.de,CONSTANTS.field1.coc,period,orgUnit,message["field1"],storedBy));
        dv.dataValues.push(makeDVJson(CONSTANTS.field2.de,CONSTANTS.field2.coc,period,orgUnit,message["field2"],storedBy));
        dv.dataValues.push(makeDVJson(CONSTANTS.field3.de,CONSTANTS.field3.coc,period,orgUnit,message["field3"],storedBy));
        dv.dataValues.push(makeDVJson(CONSTANTS.field4.de,CONSTANTS.field4.coc,period,orgUnit,message["field4"],storedBy));
        dv.dataValues.push(makeDVJson(CONSTANTS.field5.de,CONSTANTS.field5.coc,period,orgUnit,message["field5"],storedBy));
        dv.dataValues.push(makeDVJson(CONSTANTS.field6.de,CONSTANTS.field6.coc,period,orgUnit,message["field6"],storedBy));
        dv.dataValues.push(makeDVJson(CONSTANTS.field7.de,CONSTANTS.field7.coc,period,orgUnit,message["field7"],storedBy));

        ajax.postReq(CONSTANTS.DHIS_URL_BASE+"/api/dataValueSets?",dv,CONSTANTS.auth,callback);

        function callback(error,response,body){
            if (error == null){
                //send confirmation
                sendConfirmationMessage(logID,CONSTANTS.PERFECT_MESSAGE,message,"english",msgDate,data.sender);
                __logger.info(logID+"[PERFECT_MESSAGE+]"+body.status);
            }else{
                __logger.error(logID+"[PERFECT_MESSAGE-]"+error.message);
            }
        }

        function makeDVJson(de,cc,pe,ou,val,storedBy){
            var dv = {
                "dataElement":de,
                "period":pe,
                "orgUnit":ou,
                "categoryOptionCombo":cc,
                "value":val,
                "storedBy":storedBy
            }
            return dv;
        }
    }

    function getOrgUnitByPhone(logID,phone){
        var def = Q.defer();
        var url = CONSTANTS.DHIS_URL_BASE+"/api/organisationUnits?fields=id,name&filter=phoneNumber:eq:"+phone;

        ajax.getReq(url,CONSTANTS.auth,callback);
        function callback(error,response,body){
            if(error == null){
                body = JSON.parse(body);
                def.resolve(body.organisationUnits);
                __logger.info(logID+"[OrgUnit+]"+response.statusMessage + " Length:"+body.organisationUnits.length);
            }else{
                __logger.error(logID+"[OrgUnit-]"+error.message);
            }
        }

        return def.promise;
    }

    function prepareEventAndPush(logID,data,orgUnit,formatValid){

        var type = undefined;
        var event = {};
        var msgDate = moment(data.rcvd, "YYYY-MM-DD HH:mm:ss");
        event.eventDate =  msgDate;
        event.dataValues = [];
        event.dataValues.push({ dataElement:CONSTANTS.EVENT_DE_MESSAGE,     value:data.message});
        event.dataValues.push({ dataElement:CONSTANTS.EVENT_DE_MESSAGE_ID,  value:data.id});
        event.dataValues.push({ dataElement:CONSTANTS.EVENT_DE_TIMESTAMP,   value:data.date});

        if (!orgUnit){
            type = CONSTANTS.INVALID_PHONE;
            event.program = CONSTANTS.PROGRAM_PHONE_NOT_FOUND;
            event.dataValues.push({ dataElement:CONSTANTS.EVENT_DE_PHONE,value:data.number});
            event.orgUnit = CONSTANTS.ORGUNIT_ROOT_UID;

            if (formatValid){
                event.dataValues.push({ dataElement:CONSTANTS.EVENT_DE_IS_FORMAT_VALID,value:true});
            }else{
                event.dataValues.push({ dataElement:CONSTANTS.EVENT_DE_IS_FORMAT_VALID,value:false});
            }
        }else{
            event.orgUnit = orgUnit.id;
            type = CONSTANTS.INVALID_FORMAT;
            event.program = CONSTANTS.PROGRAM_INVALID_FORMAT;
        }

        pushEvent(logID,event);
        sendConfirmationMessage(logID,type,data,"english",msgDate,data.sender);

        function pushEvent(logID,event){
            var url = CONSTANTS.DHIS_URL_BASE+"/api/events?";

            ajax.postReq(url,event,CONSTANTS.auth,callback);

            function callback(error,response,body){
                if (error==null){
                    __logger.info(logID +"["+type+"-"+formatValid+"]"+"[Event Push+]"+body.message);

                }else{
                    __logger.error(logID+"["+type+"-"+formatValid+"]"+"[Event Push-]"+error.message);
                }
            }
        }
    }

    function sendConfirmationMessage(logID,type,data,language,msgDate,phone){

        var confirmationMessage = buildMsg(type,data,language,msgDate);
__logger.info(type+","+JSON.stringify(data) + phone);
        var url = buildURL();
        url = url+"&message="+confirmationMessage+"&numbers="+phone;

__logger.info(url);
        ajax.getReqWithoutAuth(url,callback);

        function callback(error,response,body){
            if (error == null){
                body = JSON.parse(body);
__logger.info(JSON.stringify(body));
                __logger.info(logID+"[ConfirmationSMS+]"+body.status);
            }else{
                __logger.error(logID+"[ConfirmationSMS-]"+error.message);
            }
        }

        function buildMsg(type,data,language,msgDate){

            var translation = CONSTANTS.languageMap[language];
            var msg = "";
            switch (type){
                case CONSTANTS.PERFECT_MESSAGE :
__logger.info(JSON.stringify(translation));
                    msg = translation[CONSTANTS.PERFECT_MESSAGE];
                    __logger.info(msg);
				msg = msg + " "+translation["male"]+"("+
                                     data["field1"]+","+
                                     data["field2"]+","+
                                     data["field3"]+"),"+translation["female"]+"("+
                                     data["field4"]+","+
                                     data["field5"]+","+
                                     data["field6"]+"),"+translation["sideEffect"]+"("+
                                     data["field7"]+") "+msgDate.format("DD-MM-YYYY");
__logger.info(msg)
                    break;

                case CONSTANTS.INVALID_FORMAT :
                    msg = translation[CONSTANTS.INVALID_FORMAT];
                    break;

                case CONSTANTS.INVALID_PHONE :
                    msg = translation[CONSTANTS.INVALID_PHONE];
                    break;
            }

            return msg;
        }

        function buildURL(){
            var url = CONSTANTS.sendSMSURL + "?username="+CONSTANTS.TEXTLOCAL_USERNAME+
                        "&hash="+CONSTANTS.TEXTLOCAL_HASH+
                        "&sender="+CONSTANTS.TEXTLOCAL_SENDER;
        return url;
        }
    }

}

module.exports = new Engine();

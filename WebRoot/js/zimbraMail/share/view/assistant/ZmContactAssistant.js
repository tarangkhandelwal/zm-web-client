/*
 * ***** BEGIN LICENSE BLOCK *****
 * Version: ZPL 1.1
 * 
 * The contents of this file are subject to the Zimbra Public License
 * Version 1.1 ("License"); you may not use this file except in
 * compliance with the License. You may obtain a copy of the License at
 * http://www.zimbra.com/license
 * 
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied. See
 * the License for the specific language governing rights and limitations
 * under the License.
 * 
 * The Original Code is: Zimbra Collaboration Suite Web Client
 * 
 * The Initial Developer of the Original Code is Zimbra, Inc.
 * Portions created by Zimbra are Copyright (C) 2005 Zimbra, Inc.
 * All Rights Reserved.
 * 
 * Contributor(s):
 * 
 * ***** END LICENSE BLOCK *****
 */

function ZmContactAssistant(appCtxt) {
	if (arguments.length == 0) return;
	ZmAssistant.call(this, appCtxt, ZmMsg.createNewContact, ZmMsg.ASST_CMD_CONTACT);
};

ZmContactAssistant.prototype = new ZmAssistant();
ZmContactAssistant.prototype.constructor = ZmContactAssistant;

ZmContactAssistant.prototype.okHandler =
function(dialog) {
	return true;	//override
};

ZmContactAssistant._CONTACT_FIELD_ORDER = [
     'f', 'm', 'l',
     'title', 'company',
	 'e', 'e2', 'e3', 
	 'wp', 'w2', 'mo', 'p', 'wf', 'a', 'c', 'cp', 'cbp',  'wa', 'wu',
	 'hp', 'h2', 'hf', 'ha', 'hu',
	 'op', 'of', 'oa', 'ou', 'notes'
];

ZmContactAssistant._CONTACT_FIELDS = {
	  a: { field: ZmMsg.AB_FIELD_assistantPhone, key: 'a' },
	  c: { field: ZmMsg.AB_FIELD_carPhone, key: 'c' },
	cbp: { field: ZmMsg.AB_FIELD_callbackPhone, key: 'cbp' },
	 co:  { field: ZmMsg.AB_FIELD_company, key: 'company' },	
company: { field: ZmMsg.AB_FIELD_company, key: 'company' },
	 cp: { field: ZmMsg.AB_FIELD_companyPhone, key: 'cp' },
	  e: { field: ZmMsg.AB_FIELD_email, key: 'e', defaultValue: ZmMsg.ASST_CONTACT_email },
	 e2: { field: ZmMsg.AB_FIELD_email2, key: 'e2' },
	 e3: { field: ZmMsg.AB_FIELD_email3, key: 'e3' },
	  f: { field: ZmMsg.AB_FIELD_firstName, key: 'f', dontShow: true },
  first: { field: ZmMsg.AB_FIELD_firstName, key: 'f', dontShow: true },	  
    fax: { field: ZmMsg.AB_FIELD_workFax, key: 'wf' }, // alias fax to wf
	 h2: { field: ZmMsg.AB_FIELD_homePhone2, key: 'h2' }, 
	 ha: { field: ZmMsg.AB_ADDR_HOME, key: 'ha', multiline: true },
	 hf: { field: ZmMsg.AB_FIELD_homeFax, key: 'hf' },
	 hp: { field: ZmMsg.AB_FIELD_homePhone, key: 'hp' },
	 hu: { field: ZmMsg.AB_HOME_URL, key: 'hu' },
jobtitle:{ field: ZmMsg.AB_FIELD_jobTitle, key: 'title' },	 // alias jobtitle to title
	  l: { field: ZmMsg.AB_FIELD_lastName, key: 'l' , dontShow: true },
   last: { field: ZmMsg.AB_FIELD_lastName, key: 'l', dontShow: true },	  
 middle: { field: ZmMsg.AB_FIELD_middleName, key: 'm' ,dontShow: true },   
	  m: { field: ZmMsg.AB_FIELD_middleName, key: 'm', dontShow: true },
	 mo: { field: ZmMsg.AB_FIELD_mobilePhone, key: 'mo' },
 mobile: { field: ZmMsg.AB_FIELD_mobilePhone, key: 'mo' },	 
  notes: { field: ZmMsg.notes, key: 'notes', multiLine: true, defaultValue: ZmMsg.ASST_CONTACT_notes },
	 oa: { field: ZmMsg.AB_ADDR_OTHER, key: 'oa', multiLine: true },
	 of: { field: ZmMsg.AB_FIELD_otherFax, key: 'of' },
	 op: { field: ZmMsg.AB_FIELD_otherPhone, key: 'op' },
	 ou: { field: ZmMsg.AB_OTHER_URL, key: 'ou' },
	  p: { field: ZmMsg.AB_FIELD_pager, key: 'p' },
	 ti: { field: ZmMsg.AB_FIELD_jobTitle, key: 'title' },
	  t: { field: ZmMsg.AB_FIELD_jobTitle, key: 'title' },	  
  title: { field: ZmMsg.AB_FIELD_jobTitle, key: 'title' },
	 w2: { field: ZmMsg.AB_FIELD_workPhone2, key: 'w2' },
	 wa: { field: ZmMsg.AB_ADDR_WORK, key: 'wa', multiLine: true },
	 wf: { field: ZmMsg.AB_FIELD_workFax, key: 'wf' },
	 wp: { field: ZmMsg.AB_FIELD_workPhone, key: 'wp' },
	 wu: { field: ZmMsg.AB_WORK_URL, key: 'wu' }
};

ZmContactAssistant._CONTACT_OBJECTS = { };
ZmContactAssistant._CONTACT_OBJECTS[ZmObjectManager.URL] = { defaultType: 'wu', aliases: { w: 'wu', h: 'hu', o: 'ou' }};
ZmContactAssistant._CONTACT_OBJECTS[ZmObjectManager.PHONE] = { defaultType: 'wp', aliases: { w: 'wp', h: 'hp', o: 'op' }};
ZmContactAssistant._CONTACT_OBJECTS[ZmObjectManager.EMAIL] = { defaultType: 'e' };
ZmContactAssistant._CONTACT_OBJECTS[ZmAssistant._BRACKETS] = { defaultType: 'wa', aliases: { w: 'wa', h: 'ha', o: 'oa' }};

// check address first, since we grab any fields quoted with [], objects in them won't be matched later
ZmContactAssistant._CONTACT_OBJECT_ORDER = [
	ZmAssistant._BRACKETS, ZmObjectManager.PHONE, ZmObjectManager.URL, ZmObjectManager.EMAIL
];

ZmContactAssistant.prototype.handle =
function(dialog, verb, args) {
	dialog._setOkButton(AjxMsg.ok, true, true); // true, "NewContact");
	var match, i;
	var objects = {};	
		
	// check address first, since we grab any fields quoted with [], objects in them won't be matched later
	for (i = 0; i < ZmContactAssistant._CONTACT_OBJECT_ORDER.length; i++) {
		var objType = ZmContactAssistant._CONTACT_OBJECT_ORDER[i];
		var obj = ZmContactAssistant._CONTACT_OBJECTS[objType];
		while (match = this._matchTypedObject(args, objType, obj)) {
			
//			var fieldData = ZmAssistantDialog._CONTACT_FIELDS[match.type];
//			if (fieldData) type = fieldData.key;

			var field = ZmContactAssistant._CONTACT_FIELDS[match.type];
			var type = field ? field.key : match.type;
			objects[type] = match;
			args = match.args;
		}
	}

	if (!objects.notes) {
		match = args.match(/\s*\(([^)]*)\)?\s*/);
		if (match) {
			objects.notes = {data : match[1] };
			args = args.replace(match[0], " ");
		}
	}

	//DBG.println("=============");
	while(match = args.match(/((\w+):\s*(.*?)\s*)(\w+:|$)/)) {
		//for (i=0; i < match.length; i++) 	DBG.println(i+" ("+match[i] + ")");
		//DBG.println("-----");
		var k = match[2];
		var v = match[3];
		var field = ZmContactAssistant._CONTACT_FIELDS[k];
		if (field) {
			if (v == null) v = "";
			objects[field.key] = {data: v};
		}
		args = args.replace(match[1],"");	
	}
	//DBG.println("=============");

	var remaining = args.replace(/^\s+/, "").replace(/\s+$/, "").replace(/\s+/g, ' '); //.split(",", 3);
		
	var fullName = remaining;
	
	if (objects.f || objects.m || objects.l) {
		fullName = null;
		if (objects.f) fullName = objects.f.data;
		if (objects.m) { 
			if (fullName) fullName += " ";
			fullName += objects.m.data;
		}
		if (objects.l) { 
			if (fullName) fullName += " ";
			fullName += objects.l.data;
		}		
	}

	//if (!objects.title) objects.title = { data : remaining[1] != null ? remaining[1] : null};
	//if (!objects.company) objects.company = { data: remaining[2] != null ? remaining[2] : null};	

	var index, ri;
	
	index = this._setField(ZmMsg.AB_FIELD_fullName, fullName == "" ? ZmMsg.ASST_CONTACT_fullName : fullName, fullName == "", true);

	for (var i=0; i < ZmContactAssistant._CONTACT_FIELD_ORDER.length; i++) {	
		var key = ZmContactAssistant._CONTACT_FIELD_ORDER[i];
		var data = objects[key];
		var field = ZmContactAssistant._CONTACT_FIELDS[key];
		if (field.dontShow) continue;

		var value = (data && data.data != null) ? data.data : null;

		if (value != null) {
			value = field.multiLine ? AjxStringUtil.convertToHtml(value) : AjxStringUtil.htmlEncode(value);
		}
		if (field.defaultValue || value != null) {
			//var useDefault = (value == null || value == "");
			var useDefault = (value == null);
			ri = this._setField(field.field, useDefault ? field.defaultValue : value, useDefault, false, index+1);
		} else {
			ri = this._setOptField(field.field, value, false, false, index+1);
		}
		index = Math.max(index, ri);
	}
	return;
};

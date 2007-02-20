<%@ tag body-content="empty" %>
<%@ attribute name="folder" rtexprvalue="true" required="true" type="com.zimbra.cs.taglib.bean.ZFolderBean" %>

<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<%@ taglib prefix="fn" uri="http://java.sun.com/jsp/jstl/functions" %>
<%@ taglib prefix="fmt" uri="http://java.sun.com/jsp/jstl/fmt" %>
<%@ taglib prefix="app" uri="com.zimbra.htmlclient" %>
<%@ taglib prefix="zm" uri="com.zimbra.zm" %>

<c:set var="icon" value="${folder.isMountPoint ? 'calendar/SharedCalendarFolder.gif' : 'calendar/CalendarFolder.gif'}"/>
<fmt:message var="label" key="FOLDER_LABEL_${folder.id}"/>
<c:if test="${fn:startsWith(label,'???')}"><c:set var="label" value="${folder.name}"/></c:if>
<tr class='${folder.styleColor}Bg'>
    <td nowrap colspan=2 class='Folder<c:if test="${folder.hasUnread}"> Unread</c:if><c:if test="${folder.id eq requestScope.context.selectedId}"> Selected</c:if>'
        style='padding-left: ${folder.depth*8}px'>
        <c:choose>
            <c:when test="${folder.isCheckedInUI}"><app:calendarUrl var="url" uncheck="${folder.id}"/></c:when>
            <c:otherwise><app:calendarUrl var="url" check="${folder.id}"/></c:otherwise>
        </c:choose>
        <%--<span style='width:20px'><c:if test="${folder.hasChildren}"><app:img src="dwt/NodeExpanded.gif"/></c:if></span>--%>
        <a href='${url}'>
            <c:choose>
            <c:when test="${folder.isCheckedInUI}">
                <app:img altkey="checked" src="tasks/Task.gif"/>
            </c:when>
                <c:otherwise>
                    <app:img altkey="unchecked" src="tasks/TaskCheckbox.gif"/>
                </c:otherwise>
            </c:choose>
            <app:img src="${icon}" alt='${fn:escapeXml(label)}'/>
            ${fn:escapeXml(label)}
        </a>

    </td>
    <td width=1% align=center style='padding:0;'>
        <c:choose>
            <c:when test="${not empty folder.remoteURL}">
                <app:calendarUrl var="syncUrl" sync="${folder.id}"/>
                <a href="${syncUrl}"><app:img src="arrows/Refresh.gif"/></a>
            </c:when>
            <c:otherwise>
                &nbsp;
            </c:otherwise>
        </c:choose>
    </td>
</tr>


function loremTransform(data, meta) {
    const MONTHS = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ];

    function formatPhone(value) {
        return value ? `(${value.substring(0,3)}) ${value.substring(3,6)}-${value.substring(6,10)}` : "";
    }

    function formatDOB(value) {
        const parts = value.split(" ");
        return `${(MONTHS.indexOf(parts[0])+1).toString().padStart(2, "0")}/${parts[1].replace(",", "")}/${parts[2]}`
    }

    function formatMailingAddress(value) {
        const parts = data["Mailing address"].split(",").map(p => p.trim());
        const mail1 = parts[0];
        const mail2 = `${parts[1]}, ${parts[2]} ${parts[3]}`;
        return { mail1, mail2 };
    }

    const mail = formatMailingAddress(data["Mailing address"])
    const phone = formatPhone(data["Mobile phone"]) || formatPhone(data["Home phone"]);

    return {
        meta,
        contact: {
            name: `${data["Legal first name"]} ${data["Last name"]}`,
            mail1: mail.mail1,
            mail2: mail.mail2,
            phone,
            email: data["Email address"],
        },
        stats: {
            dob: formatDOB(data["Date of birth"]),
            height: data["Height (feet, inches)"],
            weight: `${data["Current Weight"]} lbs`,
            blood_type: data["Blood Type"],
        }
    };
}

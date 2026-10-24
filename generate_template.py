import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

def create_elite_crm_template(output_path="elite_leads_template_with_dropdowns.xlsx"):
    wb = openpyxl.Workbook()
    
    # -------------------------------------------------------------
    # Sheet 1: Leads Import
    # -------------------------------------------------------------
    ws = wb.active
    ws.title = "Leads Import"
    ws.views.sheetView[0].showGridLines = True

    # -------------------------------------------------------------
    # Sheet 2: Reference Lists (for Excel Data Validation)
    # -------------------------------------------------------------
    ref_ws = wb.create_sheet(title="Reference_Lists")
    ref_ws.views.sheetView[0].showGridLines = True

    # Master lists matching the CRM
    COUNTRIES = [
        "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia",
        "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium",
        "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei",
        "Bulgaria", "Cambodia", "Cameroon", "Canada", "Chile", "China", "Colombia", "Costa Rica",
        "Croatia", "Cyprus", "Czech Republic", "Denmark", "Dominican Republic", "Ecuador", "Egypt",
        "El Salvador", "Estonia", "Ethiopia", "Fiji", "Finland", "France", "Georgia", "Germany",
        "Ghana", "Greece", "Guatemala", "Honduras", "Hong Kong", "Hungary", "Iceland", "India",
        "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan",
        "Jordan", "Kazakhstan", "Kenya", "Kuwait", "Latvia", "Lebanon", "Lithuania", "Luxembourg",
        "Malaysia", "Maldives", "Malta", "Mauritius", "Mexico", "Moldova", "Monaco", "Mongolia",
        "Montenegro", "Morocco", "Myanmar", "Nepal", "Netherlands", "New Zealand", "Nigeria", "Norway",
        "Oman", "Pakistan", "Panama", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
        "Qatar", "Romania", "Russia", "Rwanda", "Saudi Arabia", "Serbia", "Singapore", "Slovakia",
        "Slovenia", "South Africa", "South Korea", "Spain", "Sri Lanka", "Sweden", "Switzerland",
        "Taiwan", "Tanzania", "Thailand", "Tunisia", "Turkey", "Uganda", "Ukraine",
        "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Venezuela",
        "Vietnam", "Zambia", "Zimbabwe"
    ]

    JOB_TITLES = [
        "Web Developer", "Full-Stack Developer", "Frontend Developer", "Backend Developer",
        "WordPress Developer", "Shopify Developer", "UI/UX Designer", "UI Designer",
        "UX Designer", "Web Designer", "Product Designer", "Founder & CEO", "Managing Director",
        "Chief Technology Officer", "Marketing Director", "Head of Digital Products", "Other"
    ]

    INDUSTRIES = [
        "Web Development", "Web Design", "UI/UX Design", "Software Development",
        "IT Services", "Digital Marketing Agency", "SEO Agency", "SaaS",
        "E-commerce", "WordPress Agency", "Shopify Agency", "Healthcare",
        "Media & Marketing", "Real Estate", "Furniture & Decor", "Other"
    ]

    LEAD_SOURCES = [
        "LinkedIn", "OnlineJob", "VirtualStaff", "Website Inquiry", "Referral",
        "Cold Email", "Google Search", "Upwork", "Fiverr", "Other"
    ]

    RATINGS = ["Hot", "Warm", "Cold"]

    STATUSES = [
        "New", "To Contact", "Contacted", "Interested", "Follow-up",
        "Proposal Sent", "Won", "Lost", "Not Interested"
    ]

    SERVICES = [
        "Web Development", "Website Design", "WordPress", "Shopify",
        "SEO", "Mobile App", "AI Automation", "UI/UX Design", "Other"
    ]

    PROMISING_REASONS = [
        "Looking for Web Development Services", "Looking for UI/UX Design Services",
        "Agency Seeking White-Label Partner", "Outsourcing Development Work",
        "Needs WordPress / Shopify Development", "Has Recurring Project Potential",
        "Hiring Remote Developer / Designer", "Website Redesign or Modernization",
        "Has an Active Project or Job Posting", "Potential Long-Term Partnership",
        "Budget / Project Requirements Mentioned", "Needs Follow-Up to Confirm Fit", "Other"
    ]

    NOTE_OPTIONS = [
        "Need to Send Initial Email", "Email Sent — Awaiting Response",
        "Follow Up in 2 Days", "Follow Up in 5 Days", "Follow Up Next Week",
        "Interested — Schedule Meeting", "Asked for Portfolio",
        "Asked for Pricing / Proposal", "Needs Technical Discussion",
        "Potential Long-Term Client", "Not Responding", "Not Interested",
        "Contact Details Need Verification"
    ]

    # Populate Reference Lists sheet
    ref_columns = [
        ("Job Titles", JOB_TITLES),
        ("Countries", COUNTRIES),
        ("Industries", INDUSTRIES),
        ("Sources", LEAD_SOURCES),
        ("Ratings", RATINGS),
        ("Statuses", STATUSES),
        ("Services", SERVICES),
        ("Promising Reasons", PROMISING_REASONS),
        ("Notes Options", NOTE_OPTIONS),
    ]

    ref_header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    ref_header_font = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")

    for col_idx, (title, items) in enumerate(ref_columns, start=1):
        c = ref_ws.cell(row=1, column=col_idx, value=title)
        c.fill = ref_header_fill
        c.font = ref_header_font
        c.alignment = Alignment(horizontal="center")
        for row_idx, val in enumerate(items, start=2):
            ref_ws.cell(row=row_idx, column=col_idx, value=val)
        col_letter = get_column_letter(col_idx)
        ref_ws.column_dimensions[col_letter].width = max(len(title) + 4, max(len(str(x)) for x in items) + 2)

    # -------------------------------------------------------------
    # Headers in Leads Import sheet
    # -------------------------------------------------------------
    headers = [
        ("Company Name", True, "NexGen Retail Solutions"),
        ("Contact Person", False, "Rajesh Sharma"),
        ("Job Title", False, "Chief Technology Officer"),
        ("Email", False, "rajesh@nexgenretail.com"),
        ("Phone", False, "+91 98765 43210"),
        ("Website", False, "https://nexgenretail.com"),
        ("LinkedIn URL", False, "https://linkedin.com/in/rajesh-sharma"),
        ("Country", False, "India"),
        ("Industry", False, "E-commerce"),
        ("Source", False, "LinkedIn"),
        ("Rating", False, "Hot"),
        ("Status", False, "Interested"),
        ("Service Interest", False, "Shopify"),
        ("Why Promising", False, "Expanding D2C brand needing custom Shopify store"),
        ("Notes", False, "Met on LinkedIn; budget approved for Q4")
    ]

    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="0F766E", end_color="0F766E", fill_type="solid")  # Elite Teal
    required_fill = PatternFill(start_color="0D9488", end_color="0D9488", fill_type="solid")
    border_thin = Border(
        left=Side(style='thin', color="CBD5E1"),
        right=Side(style='thin', color="CBD5E1"),
        top=Side(style='thin', color="CBD5E1"),
        bottom=Side(style='thin', color="CBD5E1")
    )

    for col_idx, (col_name, is_req, _) in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.font = header_font
        cell.fill = required_fill if is_req else header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = border_thin

    # Sample Leads rows
    sample_rows = [
        [
            "NexGen Retail Solutions", "Rajesh Sharma", "Chief Technology Officer",
            "rajesh@nexgenretail.com", "+91 98765 43210", "https://nexgenretail.com",
            "https://linkedin.com/in/rajesh-sharma", "India", "E-commerce", "LinkedIn",
            "Hot", "Interested", "Shopify",
            "Expanding D2C brand needing custom Shopify store and ERP integration",
            "Met on LinkedIn; budget approved for Q4"
        ],
        [
            "Apex Health Systems", "Sarah Jenkins", "Head of Digital Products",
            "s.jenkins@apexhealth.co.uk", "+44 20 7946 0912", "https://apexhealth.co.uk",
            "https://linkedin.com/in/sarah-jenkins", "United Kingdom", "Healthcare", "Referral",
            "Warm", "To Contact", "Mobile App",
            "Looking for cross-platform Flutter/React Native patient app",
            "Referred by Dr. Watson; follow up next Tuesday"
        ],
        [
            "Starlight Media Group", "Michael Vance", "Marketing Director",
            "michael@starlightmedia.com", "+1 (415) 555-0198", "https://starlightmedia.com",
            "https://linkedin.com/in/michael-vance", "United States", "Media & Marketing", "Website Inquiry",
            "Hot", "Proposal Sent", "Web Development",
            "Needs complete web portal redesign with high SEO performance",
            "Proposal submitted yesterday; awaiting feedback"
        ],
        [
            "Solaria Tech", "Priya Patel", "Founder & CEO",
            "priya@solaria.tech", "+91 91234 56789", "https://solaria.tech",
            "https://linkedin.com/in/priya-patel", "India", "SaaS", "Cold Email",
            "Cold", "New", "AI Automation",
            "Early-stage startup interested in automated CRM workflows",
            "Outreached via cold email; awaiting first response"
        ],
        [
            "Urban Living Furniture", "David Miller", "Managing Director",
            "david@urbanliving.com.au", "+61 2 9876 5432", "https://urbanliving.com.au",
            "https://linkedin.com/in/david-miller", "Australia", "Furniture & Decor", "Google Search",
            "Warm", "Contacted", "WordPress",
            "Wants to migrate legacy site to high-speed WooCommerce",
            "Scheduled demo call"
        ]
    ]

    data_font = Font(name="Segoe UI", size=10)
    data_alignment = Alignment(vertical="center")

    for row_idx, row_data in enumerate(sample_rows, start=2):
        for col_idx, val in enumerate(row_data, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.font = data_font
            cell.alignment = data_alignment
            cell.border = border_thin

    # -------------------------------------------------------------
    # Add Data Validation (Dropdowns) to Columns
    # -------------------------------------------------------------
    max_data_row = 1000

    # 1. Job Title (Col C = 3) -> Reference_Lists!$A$2:$A${len(JOB_TITLES)+1}
    dv_job = DataValidation(
        type="list",
        formula1=f"=Reference_Lists!$A$2:$A${len(JOB_TITLES)+1}",
        allow_blank=True,
        showDropDown=False,
        error="Please select a valid Job Title from the dropdown",
        errorTitle="Invalid Job Title"
    )
    ws.add_data_validation(dv_job)
    dv_job.add(f"C2:C{max_data_row}")

    # 2. Country (Col H = 8) -> Reference_Lists!$B$2:$B${len(COUNTRIES)+1}
    dv_country = DataValidation(
        type="list",
        formula1=f"=Reference_Lists!$B$2:$B${len(COUNTRIES)+1}",
        allow_blank=True,
        showDropDown=False,
        error="Please select a valid Country from the dropdown",
        errorTitle="Invalid Country"
    )
    ws.add_data_validation(dv_country)
    dv_country.add(f"H2:H{max_data_row}")

    # 3. Industry (Col I = 9) -> Reference_Lists!$C$2:$C${len(INDUSTRIES)+1}
    dv_industry = DataValidation(
        type="list",
        formula1=f"=Reference_Lists!$C$2:$C${len(INDUSTRIES)+1}",
        allow_blank=True,
        showDropDown=False,
        error="Please select a valid Industry from the dropdown",
        errorTitle="Invalid Industry"
    )
    ws.add_data_validation(dv_industry)
    dv_industry.add(f"I2:I{max_data_row}")

    # 4. Source (Col J = 10) -> Reference_Lists!$D$2:$D${len(LEAD_SOURCES)+1}
    dv_source = DataValidation(
        type="list",
        formula1=f"=Reference_Lists!$D$2:$D${len(LEAD_SOURCES)+1}",
        allow_blank=True,
        showDropDown=False,
        error="Please select a valid Source from the dropdown",
        errorTitle="Invalid Source"
    )
    ws.add_data_validation(dv_source)
    dv_source.add(f"J2:J{max_data_row}")

    # 5. Rating (Col K = 11) -> "Hot,Warm,Cold"
    dv_rating = DataValidation(
        type="list",
        formula1='"Hot,Warm,Cold"',
        allow_blank=True,
        showDropDown=False,
        error="Please select Hot, Warm, or Cold",
        errorTitle="Invalid Rating"
    )
    ws.add_data_validation(dv_rating)
    dv_rating.add(f"K2:K{max_data_row}")

    # 6. Status (Col L = 12) -> Reference_Lists!$F$2:$F${len(STATUSES)+1}
    dv_status = DataValidation(
        type="list",
        formula1=f"=Reference_Lists!$F$2:$F${len(STATUSES)+1}",
        allow_blank=True,
        showDropDown=False,
        error="Please select a valid Lead Status from the dropdown",
        errorTitle="Invalid Status"
    )
    ws.add_data_validation(dv_status)
    dv_status.add(f"L2:L{max_data_row}")

    # 7. Service Interest (Col M = 13) -> Reference_Lists!$G$2:$G${len(SERVICES)+1}
    dv_service = DataValidation(
        type="list",
        formula1=f"=Reference_Lists!$G$2:$G${len(SERVICES)+1}",
        allow_blank=True,
        showDropDown=False,
        error="Please select a valid Service from the dropdown",
        errorTitle="Invalid Service"
    )
    ws.add_data_validation(dv_service)
    dv_service.add(f"M2:M{max_data_row}")

    # 8. Why Promising (Col N = 14) -> Reference_Lists!$H$2:$H${len(PROMISING_REASONS)+1}
    dv_promising = DataValidation(
        type="list",
        formula1=f"=Reference_Lists!$H$2:$H${len(PROMISING_REASONS)+1}",
        allow_blank=True,
        showDropDown=False,
        error="Please select a reason from the dropdown",
        errorTitle="Invalid Reason"
    )
    ws.add_data_validation(dv_promising)
    dv_promising.add(f"N2:N{max_data_row}")

    # 9. Notes (Col O = 15) -> Reference_Lists!$I$2:$I${len(NOTE_OPTIONS)+1}
    dv_notes = DataValidation(
        type="list",
        formula1=f"=Reference_Lists!$I$2:$I${len(NOTE_OPTIONS)+1}",
        allow_blank=True,
        showDropDown=False
    )
    ws.add_data_validation(dv_notes)
    dv_notes.add(f"O2:O{max_data_row}")

    # Auto-adjust column widths
    col_widths = {
        'A': 28,  # Company Name
        'B': 22,  # Contact Person
        'C': 26,  # Job Title
        'D': 28,  # Email
        'E': 20,  # Phone
        'F': 26,  # Website
        'G': 32,  # LinkedIn URL
        'H': 18,  # Country
        'I': 22,  # Industry
        'J': 18,  # Source
        'K': 14,  # Rating
        'L': 18,  # Status
        'M': 22,  # Service Interest
        'N': 35,  # Why Promising
        'O': 35   # Notes
    }
    for col_letter, width in col_widths.items():
        ws.column_dimensions[col_letter].width = width

    ws.row_dimensions[1].height = 28
    for r in range(2, len(sample_rows) + 2):
        ws.row_dimensions[r].height = 22

    # Freeze top row
    ws.freeze_panes = "A2"

    wb.save(output_path)
    print(f"Created: {output_path}")

if __name__ == "__main__":
    create_elite_crm_template("elite_leads_template_with_dropdowns.xlsx")
    create_elite_crm_template("public/elite_leads_template_with_dropdowns.xlsx")

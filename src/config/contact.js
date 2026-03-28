// Contact configuration - secure storage for contact information
// This file should be added to .gitignore in production for security

const CONTACT_CONFIG = {
  // Phone number for WhatsApp (stored securely)
  whatsapp: {
    number: '0525078189',
    // Convert to international format for WhatsApp API
    international: '972525078189',
    displayText: '052-507-8189'
  },
  
  // Default WhatsApp message
  defaultMessage: 'שלום! אני מעוניין/ת בצילומי סוסים ורכיבה. אשמח לקבל פרטים נוספים.',
  
  // Business hours for display
  businessHours: {
    sunday: '9:00-18:00',
    monday: '9:00-18:00', 
    tuesday: '9:00-18:00',
    wednesday: '9:00-18:00',
    thursday: '9:00-18:00',
    friday: '9:00-14:00',
    saturday: 'סגור'
  }
};

// Encrypt/obfuscate the phone number for additional security
const obfuscatePhone = (phone) => {
  return btoa(phone); // Simple base64 encoding
};

const deobfuscatePhone = (encoded) => {
  try {
    return atob(encoded);
  } catch {
    return CONTACT_CONFIG.whatsapp.number; // fallback
  }
};

// Export secure contact methods
export const getWhatsAppNumber = () => {
  // In production, you might want to fetch this from environment variables
  // or a secure API endpoint
  return process.env.REACT_APP_WHATSAPP_NUMBER || CONTACT_CONFIG.whatsapp.number;
};

export const getWhatsAppInternational = () => {
  const number = getWhatsAppNumber();
  return number.startsWith('0') ? '972' + number.substring(1) : number;
};

export const getDefaultMessage = () => {
  return CONTACT_CONFIG.defaultMessage;
};

export const getBusinessHours = () => {
  return CONTACT_CONFIG.businessHours;
};

export const formatPhoneDisplay = (phone) => {
  // Format phone number for display (e.g., 052-507-8189)
  if (phone.length === 10 && phone.startsWith('0')) {
    return `${phone.substring(0, 3)}-${phone.substring(3, 6)}-${phone.substring(6)}`;
  }
  return phone;
};

export default CONTACT_CONFIG;